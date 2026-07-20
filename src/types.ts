export interface RequestTarget {
  fetch(request: Request): Response | Promise<Response>;
}

export type RequestHandler = (request: Request) => Response | Promise<Response>;
export type Injectable = RequestTarget | RequestHandler;

export type QueryValue = string | number | boolean;
export type Query =
  | URLSearchParams
  | Iterable<readonly [string, QueryValue]>
  | Record<string, QueryValue | readonly QueryValue[] | undefined>;

export type FormValue = string | number | boolean;
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

export type GetHeadOptions = RequestOptionsBase & {
  method?: "GET" | "HEAD" | "get" | "head";
} & NoBody;

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

export type InjectOptions = GetHeadOptions | BodyRequestOptions;

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

export interface TestCookieJar {
  setCookie(cookie: string, url: string | URL): Promise<void>;
  getCookies(url: string | URL): Promise<TestCookie[]>;
  clear(): Promise<void>;
}

export interface TestClientOptions {
  baseUrl?: string | URL;
  headers?: HeadersInit;
  cookies?: true | TestCookieJar;
  redirect?: RequestRedirect;
  maxRedirects?: number;
}
