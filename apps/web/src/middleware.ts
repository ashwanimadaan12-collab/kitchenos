import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/constants";

// "/order" is the customer-facing QR-ordering page (see app/order/[qrToken]/page.tsx) — a
// customer who scanned a table's QR code has no account and never will; the qrToken in the URL
// is that page's whole authorization model, not a session cookie.
const PUBLIC_PATHS = ["/login", "/signup", "/order"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/");
  const hasSession = Boolean(req.cookies.get(ACCESS_COOKIE)?.value);

  if (!isPublic && !hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // PWA install/offline plumbing (manifest, generated icons, the service worker file, and the
  // offline fallback page) must be fetchable without a session — a browser's install flow and a
  // service worker's own fetch handler never carry the app's auth cookies the way a normal
  // in-app navigation does, and gating them here would silently break installability/offline.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|sw.js|offline).*)"],
};
