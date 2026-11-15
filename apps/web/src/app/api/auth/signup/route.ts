import { NextResponse } from "next/server";
import type { AuthTokens, SessionUser } from "@kitchenos/shared";
import { ACCESS_COOKIE, ACTIVE_ORG_COOKIE, BASE_COOKIE_OPTIONS, API_URL, REFRESH_COOKIE } from "@/lib/constants";

/** Mirrors /api/auth/login's own cookie-setting exactly — signup logs the new admin straight in. */
export async function POST(req: Request) {
  const body = await req.json();

  const apiRes = await fetch(`${API_URL}/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!apiRes.ok) {
    const error = await apiRes.json().catch(() => ({ message: "Signup failed" }));
    return NextResponse.json(error, { status: apiRes.status });
  }

  const tokens = (await apiRes.json()) as AuthTokens;
  const response = NextResponse.json({ success: true });

  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...BASE_COOKIE_OPTIONS, maxAge: 15 * 60 });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...BASE_COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 });

  const meRes = await fetch(`${API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    cache: "no-store",
  });
  if (meRes.ok) {
    const me = (await meRes.json()) as SessionUser;
    const firstOrgId = me.memberships[0]?.organizationId;
    if (firstOrgId) {
      response.cookies.set(ACTIVE_ORG_COOKIE, firstOrgId, { ...BASE_COOKIE_OPTIONS, maxAge: 365 * 24 * 60 * 60 });
    }
  }

  return response;
}
