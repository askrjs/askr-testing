import {
  createTestClient,
  createTestCookieJar,
  createTestRequest,
  inject,
  type BodyRequestOptions,
  type Form,
  type FormValue,
  type GetHeadOptions,
  type Injectable,
  type InjectOptions,
  type Query,
  type QueryValue,
  type RequestHandler,
  type RequestTarget,
  type TestClient,
  type TestClientOptions,
  type TestCookie,
  type TestCookieJar,
} from "@askrjs/testing";

const app: RequestTarget = { fetch: () => new Response() };
const client = createTestClient(app, { cookies: createTestCookieJar() });
const injected: Promise<Response> = inject(app, "/", { method: "POST", json: { value: true } });
const requested: Promise<Response> = client.get("/", { query: { page: 1 } });
createTestRequest("/", { method: "POST", body: "value" });
void injected;
void requested;

const bodyOptions: BodyRequestOptions = { method: "POST", body: "value" };
const getOptions: GetHeadOptions = { method: "GET", query: { page: 1 } };
const formValue: FormValue = true;
const form: Form = { enabled: formValue };
const queryValue: QueryValue = 1;
const query: Query = { page: queryValue };
const handler: RequestHandler = () => new Response();
const injectable: Injectable = handler;
const typedClient: TestClient = client;
const clientOptions: TestClientOptions = { cookies: true };
const cookie: TestCookie = { name: "session", value: "value", httpOnly: true, secure: true };
const cookieJar: TestCookieJar = createTestCookieJar();
void bodyOptions;
void getOptions;
void form;
void query;
void injectable;
void typedClient;
void clientOptions;
void cookie;
void cookieJar;

// @ts-expect-error request bodies are mutually exclusive
const conflict: InjectOptions = { method: "POST", json: {}, form: { value: "no" } };
// @ts-expect-error GET bodies are forbidden
const getBody: InjectOptions = { method: "GET", body: "no" };
// @ts-expect-error HEAD bodies are forbidden
client.head("/", { json: {} });
void conflict;
void getBody;
