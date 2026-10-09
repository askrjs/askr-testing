import { describe, expect, it } from "vitest";
import { createTestClient, createTestCookieJar, inject, type TestCookieJar } from "../src";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("injection lifecycle boundaries", () => {
  it.each(["inject", "client"])(
    "accepts a streaming request body through %s options",
    async (entry) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first:"));
          controller.enqueue(new TextEncoder().encode("second"));
          controller.close();
        },
      });
      const target = (request: Request) => new Response(request.body);
      const response =
        entry === "inject"
          ? await inject(target, "/", { method: "POST", body: stream })
          : await createTestClient(target).post("/", { body: stream });
      expect(await response.text()).toBe("first:second");
    },
  );

  it("preserves streamed body bytes through a 307 and reuses the caller request", async () => {
    const request = new Request("https://askr.test/start", {
      method: "POST",
      redirect: "follow",
      duplex: "half",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0, 127, 128, 255]));
          controller.close();
        },
      }),
    } as RequestInit);
    const seen: number[][] = [];
    const target = async (value: Request) => {
      seen.push([...new Uint8Array(await value.arrayBuffer())]);
      return new URL(value.url).pathname === "/start"
        ? new Response(null, { status: 307, headers: { location: "/finish" } })
        : new Response("done");
    };
    await inject(target, request);
    await inject(target, request);
    expect(seen).toEqual(Array.from({ length: 4 }, () => [0, 127, 128, 255]));
    expect(request.bodyUsed).toBe(false);
    expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([0, 127, 128, 255]);
  });

  it("preserves a failing request stream's error and permits the next injection", async () => {
    const reason = new Error("source stream failed");
    const request = new Request("https://askr.test/", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        start(controller) {
          controller.error(reason);
        },
      }),
    } as RequestInit);
    await expect(inject(async (value) => new Response(await value.text()), request)).rejects.toBe(
      reason,
    );
    expect(await (await inject(() => new Response("recovered"), "/")).text()).toBe("recovered");
  });

  it.each(
    [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1].flatMap((limit) =>
      ["inject", "client default", "client override"].map((entry) => ({ limit, entry })),
    ),
  )("rejects maxRedirects $limit at $entry before invoking a target", async ({ limit, entry }) => {
    let calls = 0;
    const target = () => {
      calls++;
      return new Response("unused");
    };
    await expect(
      Promise.resolve().then(() => {
        if (entry === "inject") return inject(target, "/", { maxRedirects: limit });
        if (entry === "client default")
          return createTestClient(target, { maxRedirects: limit }).get("/");
        return createTestClient(target).get("/", { maxRedirects: limit });
      }),
    ).rejects.toThrow(/maxRedirects.*non-negative safe integer/u);
    expect(calls).toBe(0);
  });

  it.each(["succeeds", "throws", "never settles"])(
    "discards a late response after abort when cleanup %s",
    async (mode) => {
      const entered = deferred<void>();
      const reply = deferred<Response>();
      const controller = new AbortController();
      const reason = new Error("caller cancelled");
      let cancelled = 0;
      const pending = inject(
        () => {
          entered.resolve();
          return reply.promise;
        },
        "/",
        { signal: controller.signal },
      );
      await entered.promise;
      controller.abort(reason);
      await expect(pending).rejects.toBe(reason);
      reply.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled++;
              if (mode === "throws") throw new Error("cleanup failed");
              if (mode === "never settles") return new Promise<void>(() => undefined);
            },
          }),
        ),
      );
      await expect.poll(() => cancelled).toBe(1);
      expect(await (await inject(() => new Response("next"), "/")).text()).toBe("next");
    },
  );

  it("keeps the original abort when an ignored handler later rejects", async () => {
    const entered = deferred<void>();
    const reply = deferred<Response>();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const pending = inject(
      () => {
        entered.resolve();
        return reply.promise;
      },
      "/",
      { signal: controller.signal },
    );
    await entered.promise;
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    reply.reject(new Error("late target error"));
    await Promise.resolve();
    await expect(pending).rejects.toBe(reason);
  });
});

describe("shared and asynchronous cookie jars", () => {
  it("does not start a cookie lookup for an already aborted request", async () => {
    let lookups = 0,
      calls = 0;
    const reason = new Error("already cancelled");
    const jar: TestCookieJar = {
      getCookies: async () => {
        lookups++;
        return [];
      },
      setCookie: async () => {},
      clear: async () => {},
    };
    await expect(
      createTestClient(
        () => {
          calls++;
          return new Response();
        },
        { cookies: jar },
      ).get("/", { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect({ lookups, calls }).toEqual({ lookups: 0, calls: 0 });
  });

  it("leaves a delivered response body owned by the caller after abort", async () => {
    let cancelled = 0;
    const controller = new AbortController();
    const expected = new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          value.enqueue(new TextEncoder().encode("caller body"));
          value.close();
        },
        cancel() {
          cancelled++;
        },
      }),
    );
    const response = await createTestClient(() => expected, { cookies: true }).get("/", {
      signal: controller.signal,
    });
    controller.abort();
    expect(response).toBe(expected);
    expect(await response.text()).toBe("caller body");
    expect(cancelled).toBe(0);
  });

  it("applies concurrent responses in completion order and isolates a rejected request", async () => {
    const replies = new Map<string, ReturnType<typeof deferred<Response>>>();
    const entered = deferred<void>();
    const incoming: string[] = [];
    const jar = createTestCookieJar();
    const client = createTestClient(
      (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/view") return new Response(request.headers.get("cookie"));
        incoming.push(request.headers.get("cookie") ?? "");
        const reply = deferred<Response>();
        replies.set(path, reply);
        if (replies.size === 3) entered.resolve();
        return reply.promise;
      },
      { cookies: jar },
    );
    const slow = client.get("/slow");
    const fast = client.get("/fast");
    const error = new Error("application failure");
    const failed = client.get("/failed");
    const failure = expect(failed).rejects.toBe(error);
    await entered.promise;
    replies
      .get("/fast")!
      .resolve(new Response("fast", { headers: { "set-cookie": "session=fast; Path=/" } }));
    await fast;
    expect(await jar.getCookies("https://askr.test/")).toMatchObject([
      { name: "session", value: "fast" },
    ]);
    replies.get("/failed")!.reject(error);
    await failure;
    replies.get("/slow")!.resolve(
      new Response("slow", {
        headers: [
          ["set-cookie", "session=slow; Path=/"],
          ["set-cookie", "duplicate=first; Path=/"],
          ["set-cookie", "duplicate=last; Path=/"],
        ],
      }),
    );
    await slow;
    expect(incoming).toEqual(["", "", ""]);
    expect(
      Object.fromEntries(
        (await jar.getCookies("https://askr.test/")).map(({ name, value }) => [name, value]),
      ),
    ).toEqual({ session: "slow", duplicate: "last" });
    await jar.clear();
    expect(await (await client.get("/view")).text()).toBe("");
  });

  it("keeps overlapping private client sessions separate", async () => {
    const client = (name: string) =>
      createTestClient(
        (request) =>
          new URL(request.url).pathname === "/login"
            ? new Response(null, { headers: { "set-cookie": `session=${name}; Path=/` } })
            : new Response(request.headers.get("cookie")),
        { cookies: true },
      );
    const one = client("one"),
      two = client("two");
    await Promise.all([one.get("/login"), two.get("/login")]);
    await expect(
      Promise.all([one, two].map(async (value) => (await value.get("/view")).text())),
    ).resolves.toEqual(["session=one", "session=two"]);
    await one.cookies!.clear();
    expect(await (await two.get("/view")).text()).toBe("session=two");
  });

  it("rejects abort while awaiting a cookie lookup and never starts the target", async () => {
    const entered = deferred<void>();
    const lookup = deferred<Awaited<ReturnType<TestCookieJar["getCookies"]>>>();
    const controller = new AbortController();
    const reason = new Error("lookup cancelled");
    let calls = 0,
      rejected: unknown;
    const jar: TestCookieJar = {
      getCookies: () => {
        entered.resolve();
        return lookup.promise;
      },
      setCookie: async () => {},
      clear: async () => {},
    };
    const pending = createTestClient(
      () => {
        calls++;
        return new Response();
      },
      { cookies: jar },
    ).get("/", { signal: controller.signal });
    void pending.catch((error: unknown) => {
      rejected = error;
    });
    await entered.promise;
    controller.abort(reason);
    try {
      await expect.poll(() => rejected).toBe(reason);
    } finally {
      lookup.resolve([]);
      await pending.catch(() => {});
    }
    expect(calls).toBe(0);
  });

  it("aborts a pending cookie write, discards its response and starts no further writes", async () => {
    const entered = deferred<void>();
    const write = deferred<void>();
    const controller = new AbortController();
    const reason = new Error("write cancelled");
    let writes = 0,
      cancelled = 0,
      rejected: unknown;
    const jar: TestCookieJar = {
      getCookies: async () => [],
      setCookie: () => {
        writes++;
        entered.resolve();
        return write.promise;
      },
      clear: async () => {},
    };
    const pending = createTestClient(
      () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled++;
            },
          }),
          {
            headers: [
              ["set-cookie", "first=one; Path=/"],
              ["set-cookie", "second=two; Path=/"],
            ],
          },
        ),
      { cookies: jar },
    ).get("/", { signal: controller.signal });
    void pending.catch((error: unknown) => {
      rejected = error;
    });
    await entered.promise;
    controller.abort(reason);
    try {
      await expect.poll(() => rejected).toBe(reason);
      expect(cancelled).toBe(1);
    } finally {
      write.resolve();
      await pending.catch(() => {});
    }
    await Promise.resolve();
    expect(writes).toBe(1);
  });
});
