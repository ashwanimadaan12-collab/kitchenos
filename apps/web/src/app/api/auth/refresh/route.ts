import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthTokens } from "@kitchenos/shared";
import { ACCESS_COOKIE, BASE_COOKIE_OPTIONS, API_URL, REFRESH_COOKIE } from "@/lib/constants";

/** Called by the client when an API call comes back 401, to rotate the refresh token silently. */
export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: "No session." }, { status: 401 });
  }

  const apiRes = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!apiRes.ok) {
    const response = NextResponse.json({ message: "Session expired." }, { status: 401 });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const tokens = (await apiRes.json()) as AuthTokens;
  const response = NextResponse.json({ success: true });
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...BASE_COOKIE_OPTIONS, maxAge: 15 * 60 });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
