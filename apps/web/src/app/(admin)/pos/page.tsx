import Link from "next/link";
import { Badge, Card, CardHeader, Icon } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";
import { NewOrderForm } from "./new-order-form";

interface Outlet {
  id: string;
  name: string;
  code: string;
}

interface Order {
  id: string;
  orderNumber: number;
  channel: string;
  status: string;
  total: string;
  outlet: { name: string };
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Parcel",
  DELIVERY: "Delivery",
};

function rupees(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function minutesOld(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function PosPage() {
  const [outletsRes, openOrdersRes] = await Promise.all([
    apiFetch("/v1/outlets"),
    apiFetch("/v1/orders?status=OPEN"),
  ]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const openOrders: Order[] = openOrdersRes.ok ? await openOrdersRes.json() : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Order lo</h1>
          <p className="mt-1 text-sm text-ink-2">
            Naya bill kholo, ya chal rahe order pe tap karke usme item add karo.
          </p>
        </div>
        <Link
          href="/pos/offline"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong px-4 text-sm font-bold text-ink no-underline"
        >
          <Icon name="install" size={16} />
          Net nahi hai — offline sale
        </Link>
      </header>

      <Card>
        <CardHeader title="Naya order" />
        <div className="mt-4">
          <NewOrderForm outlets={outlets} />
        </div>
      </Card>

      <section>
        <h2 className="font-display text-[17px] font-bold text-ink">
          Chal rahe orders{openOrders.length > 0 ? ` (${openOrders.length})` : ""}
        </h2>

        {openOrders.length === 0 ? (
          <Card className="mt-3">
            <p className="py-6 text-center text-sm text-ink-3">
              Abhi koi order khula nahi hai. Upar se naya order shuru karo.
            </p>
          </Card>
        ) : (
          /* Each order is one big tap target — a cashier shouldn't be aiming at a
             table row with a finger. */
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {openOrders.map((order) => {
              const mins = minutesOld(order.createdAt);
              const isLate = mins >= 15;
              return (
                <li key={order.id}>
                  <Link
                    href={`/pos/orders/${order.id}`}
                    className={`flex min-h-[7rem] flex-col gap-2 rounded-card p-5 no-underline transition-colors ${
                      isLate
                        ? "border-2 border-bad bg-bad-tint"
                        : "border border-line bg-surface hover:border-brand"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="tnum font-display text-xl font-bold text-ink">
                        #{order.orderNumber}
                      </span>
                      {isLate ? (
                        <Badge tone="bad">{mins} min · Late</Badge>
                      ) : (
                        <Badge tone="brand">{CHANNEL_LABEL[order.channel] ?? order.channel}</Badge>
                      )}
                    </span>
                    <span className="text-sm font-medium text-ink-2">{order.outlet.name}</span>
                    <span className="mt-auto flex items-baseline justify-between">
                      <span className="tnum font-display text-lg font-bold text-ink">
                        {rupees(order.total)}
                      </span>
                      <span className="tnum text-xs font-semibold text-ink-3">{mins} min pehle khula</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
