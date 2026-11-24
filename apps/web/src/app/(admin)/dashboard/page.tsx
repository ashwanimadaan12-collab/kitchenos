import Link from "next/link";
import { Badge, Button, Card, CardHeader, Icon, StatTile, TableBox, TD, TH, TR, EmptyRow } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";

interface SalesSummary {
  orderCount: number;
  total: string;
  averageOrderValue: string;
}

interface OpenOrder {
  id: string;
  orderNumber: number;
  channel: string;
  status: string;
  total: string;
  outlet: { name: string };
  createdAt: string;
}

interface TopProduct {
  variantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
}

const CHANNEL_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Parcel",
  DELIVERY: "Delivery",
};

function rupees(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Minutes since the order was opened — the number that decides whether the
 *  kitchen is keeping up, so it drives the row's tone too. */
function minutesOld(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function DashboardPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const from = encodeURIComponent(startOfToday.toISOString());

  const [session, summaryRes, openRes, topRes] = await Promise.all([
    getSession(),
    apiFetch(`/v1/reports/sales-summary?from=${from}`),
    apiFetch("/v1/orders?status=OPEN"),
    apiFetch(`/v1/reports/top-products?from=${from}&limit=4`),
  ]);

  const summary: SalesSummary | null = summaryRes.ok ? await summaryRes.json() : null;
  const openOrders: OpenOrder[] = openRes.ok ? await openRes.json() : [];
  const topProducts: TopProduct[] = topRes.ok ? await topRes.json() : [];

  const late = openOrders.filter((o) => minutesOld(o.createdAt) >= 15);
  const needsSetup = (session?.memberships.length ?? 0) === 0 || (summary?.orderCount ?? 0) === 0;
  const topMax = topProducts.reduce((m, p) => Math.max(m, p.quantitySold), 0) || 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-ink text-balance">
            Namaste{session ? ` ${session.firstName}` : ""} — aaj ka din
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Link
          href="/pos"
          className="inline-flex min-h-12 items-center gap-2 rounded-control bg-brand px-5 text-[15px] font-bold text-brand-ink hover:bg-brand-hover"
        >
          <Icon name="plus" size={17} strokeWidth={2.6} />
          Naya order
        </Link>
      </header>

      {needsSetup ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-warn-line bg-warn-tint p-5">
          <div>
            <h2 className="font-display text-base font-bold text-warn">Restaurant set up karna baaki hai</h2>
            <p className="mt-1 text-sm text-ink-2">
              Outlet, menu aur tables — 2 minute ka kaam hai. Uske baad order lena shuru.
            </p>
          </div>
          <Link
            href="/quick-setup"
            className="inline-flex min-h-12 items-center rounded-control bg-warn px-5 text-sm font-bold text-white"
          >
            Quick Setup shuru karo
          </Link>
        </div>
      ) : null}

      <section aria-label="Aaj ke numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Aaj ki sale" value={rupees(summary?.total ?? 0)} note="Aaj 12 baje se ab tak" />
        <StatTile
          label="Orders"
          value={String(summary?.orderCount ?? 0)}
          note={`${openOrders.length} abhi chal rahe hain`}
        />
        <StatTile label="Average bill" value={rupees(summary?.averageOrderValue ?? 0)} note="Per order" />
        <StatTile
          label="Kitchen me pending"
          value={String(openOrders.length)}
          tone={late.length > 0 ? "bad" : "normal"}
          note={
            late.length > 0 ? (
              <span className="font-bold text-bad">{late.length} order 15 min se zyada late</span>
            ) : (
              "Sab time pe chal raha hai"
            )
          }
        />
      </section>

      <section className="flex flex-wrap items-start gap-4">
        <Card padding="flush" className="min-w-0 flex-[999_1_420px]">
          <CardHeader
            title="Chal rahe orders"
            action={
              <Link href="/pos" className="text-sm font-bold text-brand hover:underline">
                Sab dekho
              </Link>
            }
            className="border-b border-line p-5"
          />
          <TableBox caption="Abhi khule hue orders">
            <thead>
              <tr>
                <TH>Order</TH>
                <TH>Kahan</TH>
                <TH>Total</TH>
                <TH>Kitni der</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {openOrders.slice(0, 6).map((order) => {
                const mins = minutesOld(order.createdAt);
                const isLate = mins >= 15;
                return (
                  <TR key={order.id} className={isLate ? "bg-bad-tint" : ""}>
                    <TD className="font-bold">
                      <Link href={`/pos/orders/${order.id}`} className="tnum hover:underline">
                        #{order.orderNumber}
                      </Link>
                    </TD>
                    <TD>{order.outlet.name}</TD>
                    <TD className="tnum">{rupees(order.total)}</TD>
                    <TD className={`tnum ${isLate ? "font-bold text-bad" : "text-ink-2"}`}>{mins} min</TD>
                    <TD>
                      {isLate ? (
                        <Badge tone="bad">Late</Badge>
                      ) : (
                        <Badge tone="warn">{CHANNEL_LABEL[order.channel] ?? order.channel}</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
              {openOrders.length === 0 ? (
                <EmptyRow colSpan={5}>Abhi koi order khula nahi hai.</EmptyRow>
              ) : null}
            </tbody>
          </TableBox>
        </Card>

        <Card className="min-w-0 flex-[1_1_290px]">
          <CardHeader title="Aaj ke top item" />
          {topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-ink-3">Aaj ka data aane ke baad yahan dikhega.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3.5">
              {topProducts.map((p) => (
                <li key={p.variantId}>
                  <div className="flex justify-between text-sm font-bold text-ink">
                    <span className="truncate pr-2">{p.productName}</span>
                    <span className="tnum">{p.quantitySold}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${Math.round((p.quantitySold / topMax) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <Link href="/reports">
              <Button variant="secondary" size="sm" block>
                Pura sales report
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
