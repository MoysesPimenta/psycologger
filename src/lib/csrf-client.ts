/**
 * Client-side CSRF helper — Psycologger
 *
 * Reads the CSRF token from the cookie and returns headers
 * to include in state-changing fetch() calls.
 */

const CSRF_COOKIE_NAME = "psycologger-csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Read the CSRF token from the cookie.
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

/**
 * Get headers object with CSRF token included.
 * Merge with your existing headers in fetch calls.
 */
export function csrfHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getCsrfToken();
  if (token) {
    headers[CSRF_HEADER_NAME] = token;
  }
  return headers;
}

/**
 * Enhanced fetch that automatically includes the CSRF token header
 * for state-changing methods (POST, PATCH, PUT, DELETE).
 */
export async function fetchWithCsrf(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const needsCsrf = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  if (needsCsrf) {
    const token = getCsrfToken();
    if (token) {
      const headers = new Headers(init?.headers);
      headers.set(CSRF_HEADER_NAME, token);
      return fetch(input, { ...init, headers });
    }
  }

  return fetch(input, init);
}
