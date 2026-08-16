import { captureCookies, cookieHeader, createTestCookieJar } from "./cookies";
import { createTestRequest, dispatch } from "./request";
import type {
  BodyRequestOptions,
  GetHeadOptions,
  Injectable,
  InjectOptions,
  TestClientOptions,
  TestCookieJar,
} from "./types";

/** A reusable HTTP client that injects requests into a target and follows redirects. */
export interface TestClient {
  readonly cookies?: TestCookieJar;
  request(path: string | URL, options?: InjectOptions): Promise<Response>;
  get(path: string | URL, options?: Omit<GetHeadOptions, "method">): Promise<Response>;
  head(path: string | URL, options?: Omit<GetHeadOptions, "method">): Promise<Response>;
  post(path: string | URL, options?: Omit<BodyRequestOptions, "method">): Promise<Response>;
  put(path: string | URL, options?: Omit<BodyRequestOptions, "method">): Promise<Response>;
  patch(path: string | URL, options?: Omit<BodyRequestOptions, "method">): Promise<Response>;
  delete(path: string | URL, options?: Omit<BodyRequestOptions, "method">): Promise<Response>;
  options(path: string | URL, options?: Omit<BodyRequestOptions, "method">): Promise<Response>;
}

function mergeCookieHeader(headers: Headers, jarValue: string): void {
  if (!jarValue) return;
  const explicit = headers.get("cookie");
  if (!explicit) return void headers.set("cookie", jarValue);
  const names = new Set(explicit.split(";").map((part) => part.slice(0, part.indexOf("=")).trim()));
  const retained = jarValue
    .split(";")
    .filter((part) => !names.has(part.slice(0, part.indexOf("=")).trim()));
  headers.set("cookie", [...retained, explicit].join("; "));
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const sensitiveHeaders = ["authorization", "cookie", "proxy-authorization"];

function discardResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => {
    // A discarded body must not replace the redirect result with a cleanup error.
  });
}

async function run(
  target: Injectable,
  initial: Request,
  jar: TestCookieJar | undefined,
  maxRedirects: number,
): Promise<Response> {
  let request = initial;
  let hops = 0;
  for (;;) {
    const preserved = request.body ? request.clone() : request;
    const dispatched = request.clone();
    if (jar) mergeCookieHeader(dispatched.headers, await cookieHeader(jar, dispatched.url));
    const response = await dispatch(target, dispatched);
    if (jar) await captureCookies(jar, response, dispatched.url);
    if (!redirectStatuses.has(response.status) || request.redirect === "manual") return response;
    if (request.redirect === "error") {
      discardResponseBody(response);
      throw new TypeError("Redirect encountered with redirect mode 'error'");
    }
    const location = response.headers.get("location");
    if (!location) return response;
    if (hops++ >= maxRedirects) {
      discardResponseBody(response);
      throw new TypeError(`Maximum redirect count of ${maxRedirects} exceeded`);
    }

    discardResponseBody(response);

    const nextUrl = new URL(location, request.url);
    const headers = new Headers(request.headers);
    if (nextUrl.origin !== new URL(request.url).origin)
      sensitiveHeaders.forEach((name) => headers.delete(name));
    const rewrite =
      (response.status === 303 && request.method !== "HEAD") ||
      (request.method === "POST" && (response.status === 301 || response.status === 302));
    if (rewrite) {
      headers.delete("content-length");
      headers.delete("content-type");
      request = new Request(nextUrl, {
        method: "GET",
        headers,
        redirect: request.redirect,
        signal: request.signal,
      });
    } else {
      request = new Request(nextUrl, {
        method: request.method,
        headers,
        body: preserved.body,
        redirect: request.redirect,
        signal: request.signal,
        ...(preserved.body ? { duplex: "half" } : {}),
      } as RequestInit);
    }
  }
}

/**
 * Create a {@link TestClient} bound to a target for repeated request injection.
 *
 * The returned client applies shared defaults (base URL, headers, cookie jar,
 * redirect behavior) to every request made through it, and follows redirects
 * automatically unless `redirect` is overridden.
 *
 * @param target - The handler or {@link RequestTarget} to inject requests into.
 * @param options - Default options applied to every request made by this client.
 * @returns A {@link TestClient} with `request`, `get`, `post`, and other HTTP-method helpers.
 * @example
 * const client = createTestClient(app, { baseUrl: "https://example.com", cookies: true });
 * const response = await client.get("/users");
 */
export function createTestClient(target: Injectable, options: TestClientOptions = {}): TestClient {
  const jar = options.cookies === true ? createTestCookieJar() : options.cookies;
  const request = (path: string | URL, requestOptions: InjectOptions = {}) => {
    const headers = new Headers(options.headers);
    new Headers(requestOptions.headers).forEach((value, name) => headers.set(name, value));
    const built = createTestRequest(path, {
      ...requestOptions,
      baseUrl: requestOptions.baseUrl ?? options.baseUrl,
      headers,
      redirect: requestOptions.redirect ?? options.redirect ?? "manual",
    } as InjectOptions);
    return run(target, built, jar, requestOptions.maxRedirects ?? options.maxRedirects ?? 10);
  };
  const method =
    (name: string) =>
    (path: string | URL, value: object = {}) =>
      request(path, { ...value, method: name } as InjectOptions);
  return {
    cookies: jar,
    request,
    get: method("GET"),
    post: method("POST"),
    put: method("PUT"),
    patch: method("PATCH"),
    delete: method("DELETE"),
    head: method("HEAD"),
    options: method("OPTIONS"),
  } as TestClient;
}

/**
 * Inject a single request into a target and return the resulting response,
 * following redirects up to `maxRedirects` hops.
 *
 * @param target - The handler or {@link RequestTarget} to inject the request into.
 * @param request - An existing `Request` to dispatch as-is.
 * @param options - Only `maxRedirects` is honored when a `Request` is passed directly.
 * @returns The final `Response` after any redirects have been followed.
 */
export function inject(
  target: Injectable,
  request: Request,
  options?: Pick<InjectOptions, "maxRedirects">,
): Promise<Response>;
/**
 * Inject a request built from a path/URL and options into a target and return
 * the resulting response, following redirects up to `maxRedirects` hops.
 *
 * @param target - The handler or {@link RequestTarget} to inject the request into.
 * @param input - The request path or URL, resolved against `options.baseUrl`.
 * @param options - Request options such as method, headers, query, and body.
 * @returns The final `Response` after any redirects have been followed.
 * @example
 * const response = await inject(app, "/users", { method: "GET" });
 */
export function inject(
  target: Injectable,
  input: string | URL,
  options?: InjectOptions,
): Promise<Response>;
export function inject(
  target: Injectable,
  input: Request | string | URL,
  options: InjectOptions = {},
): Promise<Response> {
  const request =
    input instanceof Request
      ? input
      : createTestRequest(input, {
          ...options,
          redirect: options.redirect ?? "manual",
        } as InjectOptions);
  return run(target, request, undefined, options.maxRedirects ?? 10);
}
