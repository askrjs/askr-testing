import type { Form, InjectOptions, Injectable, Query, QueryValue } from "./types";

export const DEFAULT_BASE_URL = "https://askr.test/";

function values(value: Query | Form): Iterable<readonly [string, QueryValue]> {
  if (value instanceof URLSearchParams || Symbol.iterator in value) return value;
  return Object.entries(value).flatMap(([name, item]) =>
    item === undefined
      ? []
      : (Array.isArray(item) ? item : [item]).map((entry) => [name, entry] as const),
  );
}

function append(parameters: URLSearchParams, input: Query | Form): void {
  for (const [name, value] of values(input)) parameters.append(name, String(value));
}

function bodyModes(options: InjectOptions): string[] {
  return ["body", "json", "form"].filter((key) =>
    Object.prototype.hasOwnProperty.call(options, key),
  );
}

/**
 * Build a `Request` for testing from a path or URL and a set of options.
 *
 * Resolves `input` against `options.baseUrl` (defaulting to `https://askr.test/`),
 * appends any `query` parameters, and serializes at most one of `body`, `json`,
 * or `form` into the request body, setting an appropriate `content-type` header
 * when one isn't already present. Throws a `TypeError` if more than one body
 * mode is supplied, if `json` is `undefined`, or if a `GET`/`HEAD` request is
 * given a body.
 *
 * @param input - The request path or URL.
 * @param options - Request options such as method, headers, query, and body.
 * @returns A `Request` ready to be dispatched to a test target.
 */
export function createTestRequest(input: string | URL, options: InjectOptions = {}): Request {
  const modes = bodyModes(options);
  if (modes.length > 1) throw new TypeError(`Request body modes conflict: ${modes.join(", ")}`);
  if (modes[0] === "json" && options.json === undefined) {
    throw new TypeError("json must not be undefined");
  }
  const method = (options.method ?? "GET").toUpperCase();
  if ((method === "GET" || method === "HEAD") && modes.length > 0) {
    throw new TypeError(`${method} requests cannot have a body`);
  }

  const url = new URL(input, options.baseUrl ?? DEFAULT_BASE_URL);
  if (options.query) append(url.searchParams, options.query);
  const headers = new Headers(options.headers);
  let body: BodyInit | null | undefined;
  if (modes[0] === "json") {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  } else if (modes[0] === "form") {
    if (!headers.has("content-type"))
      headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    const parameters = new URLSearchParams();
    append(parameters, options.form!);
    body = parameters;
  } else if (modes[0] === "body") {
    body = options.body;
  }
  const {
    baseUrl: _baseUrl,
    query: _query,
    json: _json,
    form: _form,
    maxRedirects: _max,
    ...init
  } = options;
  return new Request(url, { ...init, method, headers, body });
}

export async function dispatch(target: Injectable, request: Request): Promise<Response> {
  const response = await (typeof target === "function" ? target(request) : target.fetch(request));
  if (!(response instanceof Response))
    throw new TypeError("The test target must return a Response");
  return response;
}
