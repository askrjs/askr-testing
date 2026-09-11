import { createRouter, createServerApp, json } from "@askrjs/server";
import { describe, expect, it } from "vitest";
import {
  createTestClient,
  createTestCookieJar,
  createTestRequest,
  inject,
  type RequestTarget,
} from "../src/index";

const echo: RequestTarget = {
  async fetch(request) {
    return Response.json({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: await request.text(),
    });
  },
};

describe("native injection", () => {
  it("should exercise real Askr routes and return the exact Response", async () => {
    const router = createRouter();
    router.post("/items/{id}", async ({ bind, params }) =>
      json({ id: params.id, input: await bind() }),
    );
    const app = createServerApp({ router });
    expect(
      await (await inject(app, "/items/42", { method: "POST", json: { active: true } })).json(),
    ).toEqual({ id: "42", input: { id: "42", active: true } });

    const native = new Response("native");
    expect(await inject(() => native, new Request("https://example.test"))).toBe(native);
  });

  it("should support object and function targets and validate their result", async () => {
    expect(await (await inject(echo, "/")).json()).toMatchObject({ url: "https://askr.test/" });
    await expect(inject((() => "no") as never, "/")).rejects.toThrow("must return a Response");
    const failure = new Error("boom");
    await expect(
      inject(() => {
        throw failure;
      }, "/"),
    ).rejects.toBe(failure);
  });

  it("should preserve aborts and streaming Web API bodies", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      inject(
        (request) => {
          request.signal.throwIfAborted();
          return new Response();
        },
        "/",
        { signal: controller.signal },
      ),
    ).rejects.toThrow("cancelled");
    const response = await inject(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("stream"));
              c.close();
            },
          }),
        ),
      "/",
    );
    expect(await response.text()).toBe("stream");
  });

  it("should reuse an unconsumed caller Request without consuming its body", async () => {
    const request = new Request("https://example.test/body", {
      method: "POST",
      body: "reusable",
    });
    const target = async (incoming: Request) => new Response(await incoming.text());

    expect(await (await inject(target, request)).text()).toBe("reusable");
    expect(await (await inject(target, request)).text()).toBe("reusable");
    expect(request.bodyUsed).toBe(false);
  });

  it("should reuse a Request across targets and body-preserving redirect chains", async () => {
    const request = new Request("https://example.test/start", {
      method: "POST",
      body: "redirected",
      redirect: "follow",
    });
    const redirected = async (incoming: Request) =>
      new URL(incoming.url).pathname === "/start"
        ? new Response(null, { status: 307, headers: { location: "/end" } })
        : new Response(await incoming.text());

    expect(await (await inject(redirected, request)).text()).toBe("redirected");
    expect(await (await inject(redirected, request)).text()).toBe("redirected");
    expect(
      await (await inject(async (incoming) => new Response(await incoming.text()), request)).text(),
    ).toBe("redirected");
    expect(request.bodyUsed).toBe(false);
  });

  it("should explain that an already-consumed Request must be rebuilt", async () => {
    const request = new Request("https://example.test/body", {
      method: "POST",
      body: "consumed",
    });
    await request.text();

    expect(() => inject(echo, request)).toThrow(
      "cannot inject a Request whose body has already been consumed; construct a new Request",
    );
  });

  it("should reject when an injected signal aborts a never-settling handler", async () => {
    const controller = new AbortController();
    const reason = new Error("timed out");
    const pending = inject(() => new Promise<Response>(() => undefined), "/slow", {
      signal: controller.signal,
    });

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it("should keep overlapping results attributed to their originating request", async () => {
    const releases = new Map<string, () => void>();
    const target = async (request: Request) => {
      const id = new URL(request.url).searchParams.get("id")!;
      await new Promise<void>((resolve) => releases.set(id, resolve));
      return new Response(id);
    };
    const pending = Array.from({ length: 12 }, (_, id) =>
      inject(target, `/?id=${id}`).then((response) => response.text()),
    );
    await Promise.resolve();
    await Promise.resolve();

    for (let id = 11; id >= 0; id -= 1) releases.get(String(id))!();

    await expect(Promise.all(pending)).resolves.toEqual(
      Array.from({ length: 12 }, (_, id) => String(id)),
    );
  });

  it("should preserve synchronous and asynchronous target failures by identity", async () => {
    const synchronous = new Error("synchronous");
    const asynchronous = new Error("asynchronous");

    await expect(
      inject(() => {
        throw synchronous;
      }, "/sync"),
    ).rejects.toBe(synchronous);
    await expect(inject(() => Promise.reject(asynchronous), "/async")).rejects.toBe(asynchronous);
  });
});

describe("request construction and clients", () => {
  it("should build URLs, repeated query values, and every body mode", async () => {
    const jsonRequest = createTestRequest("items?first=1", {
      method: "POST",
      query: { tag: ["a", "b"] },
      json: { ok: true },
    });
    expect(jsonRequest.url).toBe("https://askr.test/items?first=1&tag=a&tag=b");
    expect(jsonRequest.headers.get("content-type")).toBe("application/json");
    expect(await jsonRequest.text()).toBe('{"ok":true}');
    expect(
      createTestRequest("/json", {
        method: "POST",
        json: {},
        headers: { "content-type": "application/problem+json" },
      }).headers.get("content-type"),
    ).toBe("application/problem+json");
    expect(
      await createTestRequest("/form", {
        method: "POST",
        form: { one: 1, tag: ["a", "b"] },
      }).text(),
    ).toBe("one=1&tag=a&tag=b");
    expect(
      createTestRequest("/form", {
        method: "POST",
        form: { one: 1 },
        headers: { "content-type": "custom/form" },
      }).headers.get("content-type"),
    ).toBe("custom/form");
    const data = new FormData();
    data.set("file", new Blob(["x"]), "x.txt");
    expect(
      (await createTestRequest("/data", { method: "POST", body: data }).formData()).get("file"),
    ).toBeInstanceOf(File);
    expect(
      await createTestRequest("https://other.test/raw", { method: "PUT", body: "raw" }).text(),
    ).toBe("raw");
  });

  it("should reject conflicting, undefined JSON, and GET/HEAD bodies at runtime", () => {
    expect(() => createTestRequest("/", { method: "POST", json: {}, body: "x" } as never)).toThrow(
      "conflict",
    );
    expect(() => createTestRequest("/", { method: "POST", json: undefined } as never)).toThrow(
      "must not be undefined",
    );
    expect(() => createTestRequest("/", { method: "GET", body: "x" } as never)).toThrow(
      "cannot have a body",
    );
    expect(() => createTestRequest("/", { method: "HEAD", json: {} } as never)).toThrow(
      "cannot have a body",
    );
  });

  it("should identify malformed URL and method construction as testing errors", () => {
    expect(() => createTestRequest("http://[invalid")).toThrow(
      "@askrjs/testing could not construct the request URL",
    );
    expect(() => createTestRequest("/", { method: "invalid method" } as never)).toThrow(
      "@askrjs/testing could not construct the request",
    );
  });

  it("should merge headers and expose all method helpers", async () => {
    const client = createTestClient(echo, {
      baseUrl: "https://api.test/root/",
      headers: { "x-shared": "client", "x-client": "yes" },
    });
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"] as const) {
      const response = await client[method]("item", { headers: { "x-shared": "request" } });
      if (method === "head") {
        expect(response.status).toBe(200);
        continue;
      }
      const value = await response.json();
      expect(value).toMatchObject({
        method: method.toUpperCase(),
        url: "https://api.test/root/item",
      });
      expect(value.headers).toMatchObject({ "x-client": "yes", "x-shared": "request" });
    }
  });
});

describe("redirects", () => {
  const seen: Array<{ url: string; method: string; body: string; authorization: string | null }> =
    [];
  const redirects = async (request: Request) => {
    seen.push({
      url: request.url,
      method: request.method,
      body: await request.text(),
      authorization: request.headers.get("authorization"),
    });
    const path = new URL(request.url).pathname;
    if (path === "/start")
      return new Response(null, { status: 302, headers: { location: "/end" } });
    if (path === "/keep") return new Response(null, { status: 307, headers: { location: "/end" } });
    if (path === "/cross")
      return new Response(null, { status: 302, headers: { location: "https://other.test/end" } });
    if (path === "/loop")
      return new Response(null, { status: 301, headers: { location: "/loop" } });
    return new Response("done");
  };

  it.each([
    { redirect: "follow", maxRedirects: 10, rejects: false },
    { redirect: "error", maxRedirects: 10, rejects: true },
    { redirect: "follow", maxRedirects: 0, rejects: true },
  ] as const)(
    "should cancel discarded redirect bodies for $redirect with limit $maxRedirects",
    async ({ redirect, maxRedirects, rejects }) => {
      let cancelled = 0;
      const request = inject(
        (incoming) =>
          new URL(incoming.url).pathname === "/start"
            ? new Response(
                new ReadableStream({
                  cancel() {
                    cancelled += 1;
                  },
                }),
                { status: 302, headers: { location: "/end" } },
              )
            : new Response("done"),
        "/start",
        { redirect, maxRedirects },
      );

      if (rejects) await expect(request).rejects.toBeInstanceOf(TypeError);
      else expect(await (await request).text()).toBe("done");
      expect(cancelled).toBe(1);
    },
  );

  it("should preserve redirect traversal when discarded-body cancellation fails", async () => {
    const response = await inject(
      (incoming) =>
        new URL(incoming.url).pathname === "/start"
          ? new Response(
              new ReadableStream({
                cancel() {
                  throw new Error("cleanup failed");
                },
              }),
              { status: 302, headers: { location: "/end" } },
            )
          : new Response("done"),
      "/start",
      { redirect: "follow" },
    );

    expect(await response.text()).toBe("done");
  });

  it("should not wait for discarded-body cancellation to settle", async () => {
    const response = await inject(
      (incoming) =>
        new URL(incoming.url).pathname === "/start"
          ? new Response(
              new ReadableStream({
                cancel: () => new Promise(() => undefined),
              }),
              { status: 302, headers: { location: "/end" } },
            )
          : new Response("done"),
      "/start",
      { redirect: "follow" },
    );

    expect(await response.text()).toBe("done");
  });

  it("should be manual by default and follow with standard rewriting", async () => {
    expect((await inject(redirects, "/start", { method: "POST", body: "value" })).status).toBe(302);
    seen.length = 0;
    expect(
      await (
        await inject(redirects, "/start", { method: "POST", body: "value", redirect: "follow" })
      ).text(),
    ).toBe("done");
    expect(seen.map(({ method, body }) => [method, body])).toEqual([
      ["POST", "value"],
      ["GET", ""],
    ]);
    seen.length = 0;
    await inject(redirects, "/keep", { method: "POST", body: "value", redirect: "follow" });
    expect(seen.at(-1)).toMatchObject({ method: "POST", body: "value" });
  });

  it("should handle redirect errors, missing locations, limits, and credential stripping", async () => {
    await expect(inject(redirects, "/start", { redirect: "error" })).rejects.toThrow(
      "Redirect encountered",
    );
    expect(
      (await inject(() => new Response(null, { status: 302 }), "/", { redirect: "follow" })).status,
    ).toBe(302);
    await expect(
      inject(redirects, "/loop", { redirect: "follow", maxRedirects: 2 }),
    ).rejects.toThrow("Maximum redirect count");
    seen.length = 0;
    await inject(redirects, "/cross", {
      redirect: "follow",
      headers: { authorization: "secret", cookie: "private=yes" },
    });
    expect(seen.at(-1)?.authorization).toBeNull();
  });

  it.each([0, 1, 8])("should follow and dispose a chain containing %i redirects", async (hops) => {
    let cancellations = 0;
    const response = await inject(
      (request) => {
        const step = Number(new URL(request.url).searchParams.get("step") ?? "0");
        if (step >= hops) return new Response(`done:${step}`);
        return new Response(
          new ReadableStream({
            cancel() {
              cancellations += 1;
            },
          }),
          { status: 302, headers: { location: `/?step=${step + 1}` } },
        );
      },
      "/?step=0",
      { redirect: "follow", maxRedirects: Math.max(hops, 1) },
    );

    expect(await response.text()).toBe(`done:${hops}`);
    expect(cancellations).toBe(hops);
  });

  it("should expose native body-consumption semantics inside a handler", async () => {
    await expect(
      inject(
        async (request) => {
          await request.text();
          await request.text();
          return new Response();
        },
        "/body",
        { method: "POST", body: "once" },
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe("cookie sessions", () => {
  it("should accept any implementation of the public TestCookieJar interface", async () => {
    const stored = new Map<string, string>();
    const jar = {
      async setCookie(cookie: string) {
        const [pair] = cookie.split(";", 1);
        const separator = pair.indexOf("=");
        stored.set(pair.slice(0, separator), pair.slice(separator + 1));
      },
      async getCookies() {
        return [...stored].map(([name, value]) => ({
          name,
          value,
          httpOnly: false,
          secure: false,
        }));
      },
      async clear() {
        stored.clear();
      },
    };
    const client = createTestClient(
      (request) =>
        new Response(request.headers.get("cookie"), {
          headers: { "set-cookie": "session=updated; Path=/" },
        }),
      { baseUrl: "https://example.test", cookies: jar },
    );

    await jar.setCookie("seed=yes", "https://example.test/");
    expect(await (await client.get("/")).text()).toBe("seed=yes");
    expect(stored.get("session")).toBe("updated");
  });

  it("should seed, list, clear, isolate, and override cookies", async () => {
    const jar = createTestCookieJar();
    await jar.setCookie("seed=yes; Path=/; Secure", "https://example.test/");
    expect(await jar.getCookies("https://example.test/")).toMatchObject([
      { name: "seed", value: "yes", secure: true },
    ]);
    const client = createTestClient(echo, { baseUrl: "https://example.test", cookies: jar });
    expect(
      (await (await client.get("/", { headers: { cookie: "seed=no; explicit=yes" } })).json())
        .headers.cookie,
    ).toBe("seed=no; explicit=yes");
    await jar.clear();
    expect(await jar.getCookies("https://example.test/")).toEqual([]);
    await expect(jar.setCookie("broken", "https://example.test/")).rejects.toThrow();
    expect(createTestClient(echo, { cookies: true }).cookies).not.toBe(
      createTestClient(echo, { cookies: true }).cookies,
    );
  });

  it("should capture multiple cookies and redirect cookies with standards rules", async () => {
    const client = createTestClient(
      (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/login")
          return new Response(null, {
            status: 302,
            headers: [
              ["location", "/account"],
              ["set-cookie", "session=secret; Path=/; Secure; HttpOnly"],
              ["set-cookie", "scoped=yes; Path=/account"],
            ],
          });
        return new Response(request.headers.get("cookie"));
      },
      { baseUrl: "https://example.test", cookies: true, redirect: "follow" },
    );
    expect(await (await client.get("/login")).text()).toBe("scoped=yes; session=secret");
    expect(await client.cookies?.getCookies("https://example.test/account")).toHaveLength(2);
  });

  it("should honor domain, secure, expiry, prefixes, public suffixes, and deletion", async () => {
    const jar = createTestCookieJar();
    await jar.setCookie("root=yes; Domain=example.test; Path=/", "https://example.test/");
    await jar.setCookie("secure=yes; Secure; Path=/", "https://example.test/");
    await jar.setCookie("gone=yes; Max-Age=0; Path=/", "https://example.test/");
    expect((await jar.getCookies("https://sub.example.test/")).map((c) => c.name)).toEqual([
      "root",
    ]);
    expect((await jar.getCookies("http://example.test/")).map((c) => c.name)).toEqual(["root"]);
    await expect(jar.setCookie("bad=yes; Domain=com", "https://example.com/")).rejects.toThrow();
    await expect(
      jar.setCookie("__Host-bad=yes; Secure; Domain=example.test; Path=/", "https://example.test/"),
    ).rejects.toThrow();
  });
});
