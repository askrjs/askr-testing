/** A target that can receive an injected request directly via a `fetch`-style method. */
export interface RequestTarget {
  fetch(request: Request): Response | Promise<Response>;
}

/** A function that handles a `Request` and produces a `Response`, synchronously or asynchronously. */
export type RequestHandler = (request: Request) => Response | Promise<Response>;
/** Anything that can receive an injected test request: a {@link RequestTarget} or a {@link RequestHandler}. */
export type Injectable = RequestTarget | RequestHandler;

/** A single query string value, coerced to `string` when serialized. */
export type QueryValue = string | number | boolean;
/** Query string parameters, accepted as `URLSearchParams`, an iterable of entries, or a plain record. */
export type Query =
  | URLSearchParams
  | Iterable<readonly [string, QueryValue]>
  | Record<string, QueryValue | readonly QueryValue[] | undefined>;

/** A single form field value, coerced to `string` when serialized. */
export type FormValue = string | number | boolean;
/** URL-encoded form body data, accepted as `URLSearchParams`, an iterable of entries, or a plain record. */
export type Form =
  | URLSearchParams
  | Iterable<readonly [string, FormValue]>
  | Record<string, FormValue | readonly FormValue[] | undefined>;

type NoBody = { body?: never; json?: never; form?: never };
type BodyMode =
  | { body?: BodyInit | null; json?: never; form?: never }
  | { body?: never; json: unknown; form?: never }
  | { body?: never; json?: never; form: Form };

type RequestOptionsBase = Omit<RequestInit, "body" | "headers" | "method"> & {
  baseUrl?: string | URL;
  headers?: HeadersInit;
  query?: Query;
  maxRedirects?: number;
};

/** Options for a body-less `GET` or `HEAD` request. */
export type GetHeadOptions = RequestOptionsBase & {
  method?: "GET" | "HEAD" | "get" | "head";
} & NoBody;

/** Options for a request that may carry a body, restricted to methods that support one. */
export type BodyRequestOptions = RequestOptionsBase & {
  method:
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "post"
    | "put"
    | "patch"
    | "delete"
    | "options";
} & BodyMode;

/** Options accepted when injecting a request, covering both body-less and body-carrying methods. */
export type InjectOptions = GetHeadOptions | BodyRequestOptions;

/** A cookie as read back from a {@link TestCookieJar}. */
export interface TestCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date | "Infinity";
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "strict" | "lax" | "none";
}

/** A cookie jar used to persist and replay cookies across injected requests. */
export interface TestCookieJar {
  setCookie(cookie: string, url: string | URL): Promise<void>;
  getCookies(url: string | URL): Promise<TestCookie[]>;
  clear(): Promise<void>;
}

/** Options for constructing a {@link TestClient}. */
export interface TestClientOptions {
  baseUrl?: string | URL;
  headers?: HeadersInit;
  /** Enable an automatically managed cookie jar (`true`), or supply an existing {@link TestCookieJar}. */
  cookies?: true | TestCookieJar;
  redirect?: RequestRedirect;
  maxRedirects?: number;
}
