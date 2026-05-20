/**
 * Admin API client — lightweight HTTP wrapper with cookie-based authentication.
 *
 * Authentication is managed via HttpOnly cookies set by the backend.
 * The client includes `credentials: "include"` in all requests so the
 * browser automatically sends the session cookie.
 */

/** Base path for all admin API requests (proxied by Vite in dev). */
const BASE = "/api/admin";

/**
 * Perform an authenticated API request.
 *
 * The browser automatically sends the HttpOnly session cookie.
 * No manual token management needed.
 *
 * @param method - HTTP method.
 * @param path   - Path relative to `/api/admin`.
 * @param body   - Optional request body (will be JSON-serialized).
 * @returns Parsed JSON response.
 * @throws {Error} With the server's error message.
 */
async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || res.statusText);
    }

    return res.json();
}

/** Typed HTTP helpers for admin API calls. */
export const api = {
    get: <T = any>(path: string) => request<T>("GET", path),
    post: <T = any>(path: string, body?: any) => request<T>("POST", path, body),
    put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body),
    del: <T = any>(path: string) => request<T>("DELETE", path),
};
