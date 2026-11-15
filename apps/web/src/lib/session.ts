import "server-only";
import { cookies } from "next/headers";
import type { SessionUser } from "@kitchenos/shared";
import { ACCESS_COOKIE, ACTIVE_ORG_COOKIE, API_URL } from "./constants";

/**
 * Reads the current session on the server by calling the API's /auth/me
 * with the access token from the httpOnly cookie. Returns null (never
 * throws) when there is no valid session, so callers can `redirect` freely.
 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const res = await fetch(`${API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return (await res.json()) as SessionUser;
}

export async function getActiveOrganizationId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}
