import {
  createTestClient,
  createTestCookieJar,
  createTestRequest,
  inject,
  type InjectOptions,
  type RequestTarget,
} from "@askrjs/testing";

const app: RequestTarget = { fetch: () => new Response() };
const client = createTestClient(app, { cookies: createTestCookieJar() });
const injected: Promise<Response> = inject(app, "/", { method: "POST", json: { value: true } });
const requested: Promise<Response> = client.get("/", { query: { page: 1 } });
createTestRequest("/", { method: "POST", body: "value" });
void injected;
void requested;

// @ts-expect-error request bodies are mutually exclusive
const conflict: InjectOptions = { method: "POST", json: {}, form: { value: "no" } };
// @ts-expect-error GET bodies are forbidden
const getBody: InjectOptions = { method: "GET", body: "no" };
// @ts-expect-error HEAD bodies are forbidden
client.head("/", { json: {} });
void conflict;
void getBody;
