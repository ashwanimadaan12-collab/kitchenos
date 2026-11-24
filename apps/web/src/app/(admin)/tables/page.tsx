import { headers } from "next/headers";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateTableForm } from "./create-table-form";

interface Outlet {
  id: string;
  name: string;
}

interface TableRow {
  id: string;
  name: string;
  outletId: string;
  qrToken: string;
  isActive: boolean;
  openOrder: { id: string; orderNumber: number; total: string } | null;
}

/** Reconstructs this app's own public origin from the incoming request — there's no dedicated
 *  "web app's own URL" env var, and deriving it this way means the QR codes always point at
 *  whatever host actually served this page (right in local dev, right behind Caddy in prod). */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function TablesPage() {
  const [outletsRes, tablesRes, origin] = await Promise.all([apiFetch("/v1/outlets"), apiFetch("/v1/tables"), getOrigin()]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const tables: TableRow[] = tablesRes.ok ? await tablesRes.json() : [];
  const outletNameById = new Map(outlets.map((o) => [o.id, o.name]));

  const qrCodes = new Map(
    await Promise.all(
      tables.map(async (t) => [t.id, await QRCode.toDataURL(`${origin}/order/${t.qrToken}`, { width: 160 })] as const),
    ),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dine-in tables</h1>
      <p className="mt-2 text-sm text-ink-2">
        Each table gets its own QR code. A customer who scans it sees the menu and can place an order
        directly — no app, no login — which lands in the normal POS/KDS flow as a cash-at-counter sale.
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateTableForm outlets={outlets} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => (
          <div key={table.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-ink">{table.name}</p>
                <p className="text-xs text-ink-2">{outletNameById.get(table.outletId) ?? "Unknown outlet"}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  table.openOrder ? "bg-warn-tint text-warn" : "bg-good-tint text-good"
                }`}
              >
                {table.openOrder ? `Occupied · #${table.openOrder.orderNumber} · ₹${table.openOrder.total}` : "Free"}
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote image */}
            <img src={qrCodes.get(table.id)} alt={`QR code for ${table.name}`} className="mt-3 h-40 w-40" />
            <div className="mt-3 flex items-center justify-between">
              <ToggleActiveButton path={`tables/${table.id}`} isActive={table.isActive} />
            </div>
          </div>
        ))}
        {tables.length === 0 ? <p className="text-sm text-ink-3">No tables yet.</p> : null}
      </div>
    </div>
  );
}
