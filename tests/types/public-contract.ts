import {
  createTestClient,
  createTestCookieJar,
  inject,
  type Form,
  type Injectable,
  type InjectOptions,
  type Query,
  type TestClient,
  type TestClientOptions,
  type TestCookie,
  type TestCookieJar,
} from "@askrjs/testing";

const app: Injectable = { fetch: () => new Response() };
const handler: Injectable = () => new Response();
const jar: TestCookieJar = createTestCookieJar();
const defaults: TestClientOptions = { cookies: jar, maxRedirects: 0 };
const client: TestClient = createTestClient(app, defaults);
const query: Query = { page: [1, 2], active: true };
const form: Form = new URLSearchParams({ active: "true" });
const options: InjectOptions = { method: "POST", form, query };
const cookie: TestCookie = { name: "session", value: "value", httpOnly: true, secure: true };
const injected: Promise<Response> = inject(handler, "/", options);
const native: Promise<Response> = inject(app, new Request("https://askr.test/"));
const requested: Promise<Response> = client.get("/", { query });
const bodyOptions: Extract<InjectOptions, { method: string }> = { method: "POST", body: "value" };
const getOptions: Parameters<TestClient["get"]>[1] = { query };
void [injected, native, requested, cookie, bodyOptions, getOptions];

// @ts-expect-error Request body modes are mutually exclusive.
const conflict: InjectOptions = { method: "POST", json: {}, form: { value: "no" } };
// @ts-expect-error GET bodies are forbidden.
const getBody: InjectOptions = { method: "GET", body: "no" };
// @ts-expect-error HEAD bodies are forbidden.
client.head("/", { json: {} });
// @ts-expect-error A target must return a Response.
const invalidTarget: Injectable = () => "not a Response";
void [conflict, getBody, invalidTarget];

// @ts-expect-error Removed 0.4 public name must remain private.
import type { BodyRequestOptions as Removed_BodyRequestOptions } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { FormValue as Removed_FormValue } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { GetHeadOptions as Removed_GetHeadOptions } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { QueryValue as Removed_QueryValue } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { RequestHandler as Removed_RequestHandler } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { RequestTarget as Removed_RequestTarget } from "@askrjs/testing";

// @ts-expect-error Removed 0.4 public name must remain private.
import type { createTestRequest as Removed_createTestRequest } from "@askrjs/testing";

export type RemovedNames =
  | Removed_BodyRequestOptions
  | Removed_FormValue
  | Removed_GetHeadOptions
  | Removed_QueryValue
  | Removed_RequestHandler
  | Removed_RequestTarget
  | Removed_createTestRequest;
