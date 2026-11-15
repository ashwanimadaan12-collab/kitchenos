import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

/**
 * Thin authenticated proxy from the browser to the NestJS API's /v1 catalog
 * endpoints (brands/kitchens/outlets and their mappings). Mirrors what a
 * direct fetch with the user's own access token would do — apiFetch reads
 * that token from the httpOnly cookie server-side, so the browser never
 * sees it, and the backend's own RBAC still governs what each call can do.
 */
async function proxy(req: Request, path: string[], method: string) {
  const hasBody = method === "POST" || method === "PATCH" || method === "PUT";
  const body = hasBody ? await req.text() : undefined;
  const search = new URL(req.url).search;

  const apiRes = await apiFetch(`/v1/${path.join("/")}${search}`, { method, body });
  const text = await apiRes.text();

  return new NextResponse(text, {
    status: apiRes.status,
    headers: { "Content-Type": apiRes.headers.get("content-type") ?? "application/json" },
  });
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: RouteParams) {
  return proxy(req, (await params).path, "GET");
}

export async function POST(req: Request, { params }: RouteParams) {
  return proxy(req, (await params).path, "POST");
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return proxy(req, (await params).path, "PATCH");
}

export async function PUT(req: Request, { params }: RouteParams) {
  return proxy(req, (await params).path, "PUT");
}

export async function DELETE(req: Request, { params }: RouteParams) {
  return proxy(req, (await params).path, "DELETE");
}
