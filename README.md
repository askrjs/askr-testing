# @askrjs/testing

[![CI](https://github.com/askrjs/askr-testing/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/askrjs/askr-testing/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40askrjs%2Ftesting.svg)](https://www.npmjs.com/package/@askrjs/testing)

Test Askr applications by passing Web `Request` objects directly to their `fetch` handler. No port
is opened and no network request is made.

For browser/integration coverage of production widgets and responsive shells,
see [browser harness guidance](docs/browser-harness.md). Fallback DOM tests do
not replace real-browser focus and keyboard verification.

The package works with any Node test runner and includes no custom matchers. It requires Node 24.0
or newer (see `engines` in package.json); browser and edge runtimes are not supported.

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

`inject` accepts a handler function or an object with a `fetch(request)` method. The second argument
may also be an existing `Request`. The target's native `Response` and thrown errors are returned
unchanged, including streaming bodies and abort behavior.

## Configure repeated requests

```ts
import { createTestClient } from "@askrjs/testing";

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

Use `cookies: true` for a private jar, or pass a jar when two clients should share a session. The
jar enforces domain, host, path, secure, expiry, public-suffix, and cookie-prefix rules. It captures
every `Set-Cookie` header, including headers from redirect responses. A cookie supplied on the
request overrides a jar cookie with the same name. SameSite navigation policy is not emulated.

## Redirects

Redirects are manual by default, keeping the first 3xx `Response` visible. Set `redirect: "follow"`
to follow 301, 302, 303, 307, and 308 responses inside the same target, or `redirect: "error"` to
reject them. Relative locations, standard method/body rewriting, cross-origin credential stripping,
and cookies set during redirects are supported. The default limit is 10 hops and can be changed
with `maxRedirects`, which must be a non-negative safe integer. Invalid defaults or request overrides
throw before the target runs; zero permits a non-redirect response and rejects the first followed redirect.

Followed requests are sent back to the same in-process target; redirects never reach the network.

## Injection boundary

`inject` uses the same Web `Request`, `Response`, `Headers`, body-stream, and abort-signal types that
the Node adapter presents to an Askr application. It preserves native header normalization, repeated
`Set-Cookie` values, streaming response bodies, thrown errors, and abort reasons. An unconsumed
caller-owned `Request` may be injected repeatedly because each dispatch receives a clone. If a caller
has already consumed that original body, construct a new `Request` before injecting it.

This is intentionally not a socket emulator. Unlike `@askrjs/node`, injection does not exercise HTTP
parsing, the adapter-authenticated client-address header, socket backpressure, server timeout options,
connection errors, or network timing. Response bodies remain streams but are consumed directly by the
test rather than written through a Node socket. Use an actual `@askrjs/node` listener when those
transport properties are part of the behavior under test.

## Cancellation and shared state

Aborting rejects a pending handler, cookie lookup, or cookie capture with the original abort reason.
A response arriving after abort is discarded, as is a response held while cookie capture is aborted.
Discarding a response calls its body's cancel method without awaiting completion. A failing or
never-settling cancel hook cannot replace the abort or redirect outcome. After a response is returned,
the caller owns its body.

An application handler or custom cookie store may ignore the signal and continue its own work.
Injection cannot undo a cookie write that has already started. It starts no later cookie writes after
abort, but a started custom write may finish afterward. Await those operations before clearing shared
state between tests. Shared jars apply completed response writes as they arrive, without transaction
isolation; concurrent login tests needing independent sessions should use separate private clients.
The built-in jar ignores rejected response cookies. A custom store's read or write rejection fails
injection with that same error; custom stores should resolve normally when ignoring an invalid cookie.

Request cloning preserves an unconsumed caller-owned request for repeated injection and body-preserving
redirects. Cloned streams can buffer unread tee branches. Use bounded bodies in injection tests and a
real Node listener for backpressure, unbounded uploads, or connection-disconnect behavior.

## 0.5 migration and qualification

The 0.5 candidate has three runtime exports: `inject`, `createTestClient`, and `createTestCookieJar`.
Use `inject(target, path, options)` for query/JSON/form construction, or pass a native `Request` when you
need to retain one. The separate `createTestRequest` constructor is private. Supporting option and
handler types are consolidated; see the [complete API decisions and migration](docs/0.5.0-api.md).
The [executed hardening matrix](docs/0.5.0-hardening.md) distinguishes local injection, browser tests,
and real transport qualification. These documents describe preparation for 0.5; package versions stay
at 0.4.x until the coordinated candidate is reviewed.
