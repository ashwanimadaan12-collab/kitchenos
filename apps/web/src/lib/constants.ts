export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const ACCESS_COOKIE = "kos_access_token";
export const REFRESH_COOKIE = "kos_refresh_token";
export const ACTIVE_ORG_COOKIE = "kos_active_org";

/** Shared between Set-Cookie options for access/refresh tokens. */
export const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
