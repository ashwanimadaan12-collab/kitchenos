import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { OrderClient } from "./order-client";

interface PublicMenu {
  outletName: string;
  brandName: string;
  tableName: string;
  items: { variantId: string; productName: string; variantName: string; price: string }[];
}

/**
 * No login, not under the (admin) route group, and exempted from the auth-redirect middleware
 * (see middleware.ts) — a customer who scanned a physical table's QR code has no account and
 * never will. The qrToken itself is this table's whole authorization model.
 */
export default async function PublicOrderPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const res = await apiFetch(`/v1/public/tables/${qrToken}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load menu");
  const menu: PublicMenu = await res.json();

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-surface-2 p-4 pb-32">
      <div className="mb-4 text-center">
        <p className="text-sm text-ink-2">{menu.brandName}</p>
        <h1 className="text-xl font-semibold text-ink">{menu.outletName}</h1>
        <p className="text-sm text-ink-2">{menu.tableName}</p>
      </div>
      <OrderClient qrToken={qrToken} items={menu.items} />
    </div>
  );
}
