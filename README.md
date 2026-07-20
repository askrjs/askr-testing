# @askrjs/testing

Node-focused request injection for fetch-shaped Askr applications. It calls an application's Web
`Request`/`Response` boundary in process: no listening port, network connection, or test-runner
integration is involved.

Requires Node 22.12 or newer. The package tests transport-neutral applications from Node test
runners; it does not claim browser or edge-runtime compatibility.

## Install

```sh
npm install --save-dev @askrjs/testing
```

## Inject a request

```ts
import { createServerApp, json } from "@askrjs/server";
import { inject } from "@askrjs/testing";

const app = createServerApp({
  routes: [{ path: "/health", handler: () => json({ status: "ok" }) }],
});

const response = await inject(app, "/health");

expect(response).toBeInstanceOf(Response);
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ status: "ok" });
```

`inject` accepts a function, an object with `fetch(request)`, or an existing `Request`. It returns
the exact native `Response` returned by the target and lets thrown errors propagate unchanged.
Streaming response bodies and abort signals therefore retain their normal Web API behavior.

## Construct requests and clients

```ts
import { createTestClient, createTestRequest } from "@askrjs/testing";

const request = createTestRequest("/items", {
  method: "POST",
  query: { tag: ["desk", "hardware"] },
  json: { name: "keyboard" },
});

const client = createTestClient(app, {
  baseUrl: "https://example.test/api/",
  headers: { "x-test-suite": "items" },
});

const response = await client.post("items", {
  headers: { "x-test-suite": "create-item" },
  form: { enabled: true, tag: ["desk", "hardware"] },
});
```

The default base URL is `https://askr.test/`. Per-request headers override client headers. Query
objects may contain arrays for repeated values. Exactly one of `json`, `form`, or `body` may be
used; `body` accepts native Web API body types including `FormData` and streams. JSON `undefined`
and GET/HEAD bodies are rejected.

Clients are stateless by default. Each method returns a native `Response`, so use the assertion
library supplied by your test runner.

## Opt-in cookie sessions

```ts
import { createTestClient, createTestCookieJar } from "@askrjs/testing";

const jar = createTestCookieJar();
await jar.setCookie("seed=yes; Path=/; Secure", "https://example.test/");

const client = createTestClient(app, { baseUrl: "https://example.test", cookies: jar });
await client.post("/login", { json: { email: "person@example.test" } });
const account = await client.get("/account");

const cookies = await jar.getCookies("https://example.test/account");
await jar.clear();
```

Use `cookies: true` for a new isolated jar or pass a jar to share an intentional session. Cookie
domain, host, path, secure, expiry, public-suffix, and prefix rules are provided by tough-cookie.
Every `Set-Cookie` header is captured, including redirect hops. Explicit request cookies override
same-named jar cookies. SameSite navigation policy is not browser-emulated.

## Redirects

Redirects are manual by default, keeping the first 3xx `Response` visible. Set `redirect: "follow"`
to follow 301, 302, 303, 307, and 308 responses inside the same target, or `redirect: "error"` to
reject them. Relative locations, standard method/body rewriting, cross-origin credential stripping,
and cookies set during redirects are supported. The default limit is 10 hops and can be changed
with `maxRedirects`.

Following a redirect never calls the network: the new request is dispatched to the same in-process
target.
