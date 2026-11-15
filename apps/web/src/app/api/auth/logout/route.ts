import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACTIVE_ORG_COOKIE, API_URL, REFRESH_COOKIE } from "@/lib/constants";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  const accessToken = store.get(ACCESS_COOKIE)?.value;

  if (refreshToken && accessToken) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  return response;
}
