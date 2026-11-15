import "server-only";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACTIVE_ORG_COOKIE, API_URL } from "./constants";

/**
 * Authenticated fetch for Server Components / Route Handlers: attaches the
 * access token and active-organization header from httpOnly cookies, so
 * callers never have to pass tokens around in server code.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const activeOrgId = store.get(ACTIVE_ORG_COOKIE)?.value;

  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (activeOrgId) headers.set("X-Organization-Id", activeOrgId);
  headers.set("Content-Type", "application/json");

  return fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
}
