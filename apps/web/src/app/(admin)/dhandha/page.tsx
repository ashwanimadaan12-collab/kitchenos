import Link from "next/link";
import { Badge, Card, CardHeader, Icon, StatTile } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";

interface HourRow {
  hour: number;
  orderCount: number;
  revenue: string;
}

interface WeekdayRow {
  dayOfWeek: number;
  orderCount: number;
  revenue: string;
}

interface TopProductRow {
  variantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
  revenue: string;
}

interface IngredientForecastRow {
  ingredientId: string;
  ingredientName: string;
  kitchenId: string;
  daysOfStockRemaining: number | null;
  stockoutRisk: string;
}

interface GrowthDashboard {
  customerRepeatRate: { totalCustomers: number; repeatCustomers: number; repeatRatePercent: number };
  stockoutRisks: IngredientForecastRow[];
}

const DAY_SHORT = ["Ravi", "Som", "Mangal", "Budh", "Guru", "Shukra", "Shani"];

function rupees(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return Number.isFinite(n) ? "₹" + Math.round(n).toLocaleString("en-IN") : "₹0";
}

/** 14 -> "2 PM", so the owner reads the clock they actually use. */
function clock(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) return fallback;
  return (await res.json()) as T;
}

/**
 * The four questions a small restaurant owner actually asks, on one screen:
 * when is the rush, which day earns, what sells, who comes back.
 *
 * All of this already existed in the API and on the Growth Dashboard, but
 * buried in a collapsed menu behind nine tables of numbers — so nobody looked.
 */
export default async function DhandhaPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const daysParam = Number((await searchParams).days);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  const qs = `?from=${encodeURIComponent(from.toISOString())}`;

  const [hourly, weekday, topProducts, growth] = await Promise.all([
    getJson<HourRow[]>(`/v1/reports/hourly-distribution${qs}`, []),
    getJson<WeekdayRow[]>(`/v1/reports/weekday-distribution${qs}`, []),
    getJson<TopProductRow[]>(`/v1/reports/top-products${qs}&limit=8`, []),
    getJson<GrowthDashboard | null>(`/v1/dashboard/growth${qs}`, null),
  ]);

  const busyHours = hourly.filter((h) => h.orderCount > 0);
  const peak = busyHours.reduce<HourRow | null>(
    (best, h) => (best === null || h.orderCount > best.orderCount ? h : best),
    null,
  );
  const quiet = busyHours.reduce<HourRow | null>(
    (worst, h) => (worst === null || h.orderCount < worst.orderCount ? h : worst),
    null,
  );
  const hourMax = hourly.reduce((m, h) => Math.max(m, h.orderCount), 0) || 1;

  const bestDay = weekday.reduce<WeekdayRow | null>(
    (best, d) => (best === null || Number(d.revenue) > Number(best.revenue) ? d : best),
    null,
  );
  const dayMax = weekday.reduce((m, d) => Math.max(m, Number(d.revenue)), 0) || 1;

  const repeat = growth?.customerRepeatRate;
  const topMax = topProducts.reduce((m, p) => Math.max(m, p.quantitySold), 0) || 1;
  const hasData = busyHours.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Dhandha</h1>
          <p className="mt-1 text-sm text-ink-2">
            Bheed kab hoti hai, kaun sa din kamata hai, kya bikta hai, aur kaun wapas aata hai.
          </p>
        </div>
        <nav aria-label="Kitne din ka" className="flex gap-1 rounded-control bg-surface-2 p-1">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/dhandha?days=${d}`}
              aria-current={days === d ? "page" : undefined}
              className={`min-h-11 inline-flex items-center rounded-lg px-4 text-sm no-underline ${
                days === d ? "bg-brand font-bold text-brand-ink" : "font-semibold text-ink-2"
              }`}
            >
              {d} din
            </Link>
          ))}
        </nav>
      </header>

      {!hasData ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-3">
            Pichhle {days} din me koi paid order nahi hai, to yahan dikhane ke liye kuch nahi.
          </p>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Sabse busy ghanta"
          value={peak ? clock(peak.hour) : "—"}
          note={peak ? `${peak.orderCount} order · ${rupees(peak.revenue)}` : "Data nahi"}
        />
        <StatTile
          label="Sabse khaali ghanta"
          value={quiet ? clock(quiet.hour) : "—"}
          note={quiet ? `Sirf ${quiet.orderCount} order — offer chalane layak` : "Data nahi"}
          tone={quiet ? "warn" : "normal"}
        />
        <StatTile
          label="Sabse kamane wala din"
          value={bestDay ? (DAY_SHORT[bestDay.dayOfWeek] ?? "—") : "—"}
          note={bestDay ? rupees(bestDay.revenue) : "Data nahi"}
        />
        <StatTile
          label="Wapas aane wale customer"
          value={repeat ? `${repeat.repeatRatePercent}%` : "—"}
          note={
            repeat
              ? `${repeat.totalCustomers} me se ${repeat.repeatCustomers} customer dobara aaye`
              : "Customer data nahi"
          }
        />
      </section>

      <section className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[999_1_460px]">
          <CardHeader title="Din bhar ki bheed" />
          <p className="mt-1 text-xs text-ink-2">
            Ghante ke hisaab se order. Staff ki duty aur prep isi ke hisaab se lagao.
          </p>
          {/* A plain bar row rather than a chart library: 24 bars, one measure,
              and every bar's count is on the bar itself. */}
          <ul className="mt-4 flex flex-col gap-1">
            {hourly
              .filter((h) => h.hour >= 6 || h.orderCount > 0)
              .map((h) => (
                <li key={h.hour} className="flex items-center gap-3">
                  <span className="tnum w-14 shrink-0 text-right text-xs font-semibold text-ink-2">
                    {clock(h.hour)}
                  </span>
                  <span className="h-5 min-w-0 flex-1 rounded-md bg-surface-2">
                    <span
                      className={`flex h-5 items-center justify-end rounded-md pr-2 ${
                        peak && h.hour === peak.hour ? "bg-brand-deep" : "bg-brand"
                      }`}
                      style={{ width: `${Math.max(h.orderCount === 0 ? 0 : 6, (h.orderCount / hourMax) * 100)}%` }}
                    >
                      {h.orderCount > 0 ? (
                        <span className="tnum text-[10.5px] font-bold text-white">{h.orderCount}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tnum w-20 shrink-0 text-right text-xs text-ink-2">{rupees(h.revenue)}</span>
                </li>
              ))}
          </ul>
        </Card>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card>
            <CardHeader title="Hafte ke din" />
            <ul className="mt-4 flex flex-col gap-3">
              {weekday.map((d) => (
                <li key={d.dayOfWeek}>
                  <div className="flex justify-between text-sm font-bold text-ink">
                    <span>{DAY_SHORT[d.dayOfWeek] ?? d.dayOfWeek}</span>
                    <span className="tnum">{rupees(d.revenue)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${Math.round((Number(d.revenue) / dayMax) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Sabse zyada bikne wale" />
            {topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Is period ka data nahi.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {topProducts.map((p, i) => (
                  <li key={p.variantId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-bold text-ink">
                        <span className="tnum mr-1.5 text-ink-3">{i + 1}.</span>
                        {p.productName}
                      </span>
                      <span className="tnum shrink-0 font-bold text-ink">{p.quantitySold}</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${Math.round((p.quantitySold / topMax) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </section>

      {growth?.stockoutRisks && growth.stockoutRisks.length > 0 ? (
        <Card>
          <CardHeader title="Khatam hone wala saamaan" />
          <ul className="mt-4 flex flex-wrap gap-2">
            {growth.stockoutRisks.slice(0, 8).map((r) => (
              <li key={`${r.kitchenId}-${r.ingredientId}`}>
                <Badge tone="warn">
                  {r.ingredientName}
                  {r.daysOfStockRemaining !== null ? ` · ${r.daysOfStockRemaining.toFixed(1)} din` : ""}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-2">
            <Link href="/purchase-orders" className="font-bold text-brand hover:underline">
              Purchase order banao
            </Link>{" "}
            — warna in items ke order cancel karne padenge.
          </p>
        </Card>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-ink-2">
        <Icon name="alert" size={14} />
        Ghante aur din aapke local time me hain (IST), UTC me nahi — `REPORT_UTC_OFFSET_MINUTES` se badla ja sakta hai.
      </p>
    </div>
  );
}
