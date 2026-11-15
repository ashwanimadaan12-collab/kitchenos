import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/constants";

/**
 * The access token lives in an httpOnly cookie specifically so client JS can never read it for
 * REST calls (apiFetch bridges cookie -> Authorization header server-side). A WebSocket
 * connection can't go through that same server-side bridge — the browser opens the socket
 * directly — so this one endpoint hands the token to client JS for that one purpose. This isn't a
 * materially new exposure: a page that could read this response could already call every
 * /api/catalog/* route as this user anyway (same trust boundary, same cookie).
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  const organizationId = store.get(ACTIVE_ORG_COOKIE)?.value;
  if (!token || !organizationId) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ token, organizationId });
}
