import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Icon, StatTile, TableBox, TD, TH, TR } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";

interface Settlement {
  id: string;
  platform: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  orderCount: number;
  grossSales: string;
  restaurantDiscount: string;
  commission: string;
  platformFees: string;
  taxesWithheld: string;
  otherAdjustments: string;
  calculatedNetPayout: string;
  reportedNetPayout: string | null;
  createdAt: string;
  outlet: { name: string } | null;
}

interface DayRow {
  day: string;
  posOrders: number;
  posTotal: number;
  reportOrders: number;
  reportTotal: number;
  orderDifference: number;
  totalDifference: number;
}

interface Comparison {
  posOrderCount: number;
  posTotal: number;
  reportOrderCount: number;
  reportTotal: number;
  orderDifference: number;
  totalDifference: number;
  byDay: DayRow[];
}

interface Payload {
  settlement: Settlement;
  comparison: Comparison | null;
  reason: string | null;
}

function rupees(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "₹0";
  return `${n < 0 ? "-" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/v1/settlements/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load settlement");
  const { settlement, comparison, reason }: Payload = await res.json();

  const gross = Number(settlement.grossSales);
  const payout = Number(settlement.calculatedNetPayout);
  const kept = gross > 0 ? Math.round((payout / gross) * 1000) / 10 : 0;
  // POS shows orders the report does not pay for. The other direction usually
  // means the order was never put into the POS at all.
  const missingFromReport = comparison ? comparison.orderDifference : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/online-pnl" className="text-sm font-bold text-brand no-underline hover:underline">
            ← Saari reports
          </Link>
          <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-ink">
            {settlement.platform} · {day(settlement.periodStart)} se {day(settlement.periodEnd)}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {settlement.fileName} · {settlement.orderCount} order
            {settlement.outlet ? ` · ${settlement.outlet.name}` : ""}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Gross sale" value={rupees(settlement.grossSales)} note={`${settlement.orderCount} order`} />
        <StatTile
          label="Commission"
          value={rupees(settlement.commission)}
          tone="warn"
          note={gross > 0 ? `Gross ka ${Math.round((Number(settlement.commission) / gross) * 1000) / 10}%` : ""}
        />
        <StatTile label="Bank me aaya" value={rupees(settlement.calculatedNetPayout)} note={`Gross ka ${kept}%`} />
        <StatTile
          label="Har ₹100 pe bacha"
          value={`₹${kept.toFixed(0)}`}
          tone={kept < 70 ? "bad" : "normal"}
          note={kept < 70 ? "Commission bahut zyada" : "Theek hai"}
        />
      </section>

      {reason ? (
        <Card>
          <p className="text-sm text-ink-2">
            POS se comparison nahi ho paya — {reason}. Mapping me &quot;Order ki date&quot; wala column chuno aur
            dobara upload karo.
          </p>
        </Card>
      ) : null}

      {comparison ? (
        <>
          <div
            className={`rounded-card border-2 p-5 ${
              missingFromReport > 0 ? "border-bad bg-bad-tint" : "border-line bg-surface"
            }`}
          >
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              {missingFromReport > 0 ? (
                <span className="text-bad">
                  <Icon name="alert" size={18} strokeWidth={2.2} />
                </span>
              ) : null}
              POS vs {settlement.platform}
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              In dino me aapke POS me <strong className="text-ink">{comparison.posOrderCount} delivery order</strong>{" "}
              hain, kul <strong className="text-ink">{rupees(comparison.posTotal)}</strong> ke. Report me{" "}
              <strong className="text-ink">{comparison.reportOrderCount} order</strong>,{" "}
              <strong className="text-ink">{rupees(comparison.reportTotal)}</strong> ke.
            </p>
            {missingFromReport > 0 ? (
              <p className="mt-2 text-sm font-bold text-bad">
                {missingFromReport} order aur {rupees(comparison.totalDifference)} report me nahi hain — in ka
                paisa poocho.
              </p>
            ) : missingFromReport < 0 ? (
              <p className="mt-2 text-sm font-semibold text-warn">
                Report me {Math.abs(missingFromReport)} order zyada hain. Shayad wo order POS me daale hi nahi gaye.
              </p>
            ) : (
              <p className="mt-2 text-sm font-bold text-good">Order ki ginti dono jagah same hai.</p>
            )}
          </div>

          <Card padding="flush">
            <CardHeader title="Din ke hisaab se" className="border-b border-line p-5" />
            <TableBox caption="POS aur report ka din-wise comparison">
              <thead>
                <tr>
                  <TH>Din</TH>
                  <TH className="text-right">POS order</TH>
                  <TH className="text-right">POS total</TH>
                  <TH className="text-right">Report order</TH>
                  <TH className="text-right">Report total</TH>
                  <TH className="text-right">Farak</TH>
                </tr>
              </thead>
              <tbody>
                {comparison.byDay.map((d) => (
                  <TR key={d.day} className={d.orderDifference !== 0 ? "bg-bad-tint" : ""}>
                    <TD className="font-semibold">{day(d.day)}</TD>
                    <TD className="tnum text-right">{d.posOrders}</TD>
                    <TD className="tnum text-right">{rupees(d.posTotal)}</TD>
                    <TD className="tnum text-right">{d.reportOrders}</TD>
                    <TD className="tnum text-right">{rupees(d.reportTotal)}</TD>
                    <TD className="tnum text-right">
                      {d.orderDifference === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <Badge tone={d.orderDifference > 0 ? "bad" : "warn"}>
                          {d.orderDifference > 0 ? "+" : ""}
                          {d.orderDifference} order
                        </Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableBox>
            <p className="p-5 text-xs text-ink-2">
              Order ek-ek karke match nahi hote — Zomato ka order id aapke POS me aata hi nahi jab tak aggregator
              integration na ho. Isliye ginti aur total din ke hisaab se milaye jaate hain.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
