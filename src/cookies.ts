import { CookieJar } from "tough-cookie";
import type { TestCookie, TestCookieJar } from "./types";

/**
 * Create an in-memory {@link TestCookieJar} backed by `tough-cookie`, suitable
 * for use as the `cookies` option of a {@link TestClient}.
 *
 * @returns A cookie jar that persists cookies across injected requests and
 *   enforces standard cookie-prefix security.
 */
export function createTestCookieJar(): TestCookieJar {
  const jar = new CookieJar(undefined, { prefixSecurity: "strict" });
  const api: TestCookieJar = {
    async setCookie(cookie, url) {
      await jar.setCookie(cookie, String(url));
    },
    async getCookies(url) {
      const cookies = await jar.getCookies(String(url));
      return cookies.map((cookie): TestCookie => ({
        name: cookie.key,
        value: cookie.value,
        ...(cookie.domain ? { domain: cookie.domain } : {}),
        ...(cookie.path ? { path: cookie.path } : {}),
        ...(cookie.expires ? { expires: cookie.expires } : {}),
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        ...(cookie.sameSite === "strict" || cookie.sameSite === "lax" || cookie.sameSite === "none"
          ? { sameSite: cookie.sameSite }
          : {}),
      }));
    },
    async clear() {
      await jar.removeAllCookies();
    },
  };
  return api;
}

export async function cookieHeader(jar: TestCookieJar, url: string): Promise<string> {
  const cookies = await jar.getCookies(url);
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function captureCookies(
  jar: TestCookieJar,
  response: Response,
  url: string,
): Promise<void> {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values =
    headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const value of values) {
    try {
      await jar.setCookie(value, url);
    } catch {
      // Invalid response cookies are ignored, matching browser behavior.
    }
  }
}
