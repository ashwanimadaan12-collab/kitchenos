import { NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE, BASE_COOKIE_OPTIONS } from "@/lib/constants";

/** Sets which organization the admin layout's org selector is currently scoped to. */
export async function POST(req: Request) {
  const { organizationId } = (await req.json()) as { organizationId: string };
  const response = NextResponse.json({ success: true });
  response.cookies.set(ACTIVE_ORG_COOKIE, organizationId, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
