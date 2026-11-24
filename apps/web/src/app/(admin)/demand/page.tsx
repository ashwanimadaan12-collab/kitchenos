import { apiFetch } from "@/lib/api";

interface Brand {
  id: string;
  name: string;
}

interface Outlet {
  id: string;
  name: string;
}

interface WeekdayRow {
  dayOfWeek: number;
  orderCount: number;
  revenue: string;
  averageOrderValue: string;
}

interface HourlyRow {
  hour: number;
  orderCount: number;
  revenue: string;
  averageOrderValue: string;
}

interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  orderCount: number;
  revenue: string;
}

interface PeakSlow {
  peakHour: { hour: number; orderCount: number; revenue: string } | null;
  slowHour: { hour: number; orderCount: number; revenue: string } | null;
}

interface MonthlyRow {
  month: string;
  orderCount: number;
  revenue: string;
  averageOrderValue: string;
}

interface DemandRow {
  orderCount: number;
  revenue: string;
  averageOrderValue: string;
}

interface BrandDemandRow extends DemandRow {
  brandId: string;
  brandName: string;
}

interface OutletDemandRow extends DemandRow {
  outletId: string;
  outletName: string;
}

interface ChannelDemandRow extends DemandRow {
  channel: string;
}

interface PromotionRecommendation {
  dayOfWeek: number;
  hour: number;
  orderCount: number;
  revenue: string;
  estimatedContribution: string;
  contributionPerOrder: string;
  suggestion: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Sequential single-hue ramp (light -> dark) for magnitude, per the dataviz skill's rule for
// heatmap cells — never a multi-hue "rainbow" scale.
const INTENSITY_CLASSES = [
  "bg-heat-1 text-ink",
  "bg-heat-2 text-ink",
  "bg-heat-3 text-ink",
  "bg-heat-4 text-ink",
  "bg-heat-5 text-white",
  "bg-heat-6 text-white",
  "bg-heat-7 text-white",
];

function intensityClass(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-surface-2";
  const bucket = Math.min(INTENSITY_CLASSES.length - 1, Math.floor((count / max) * (INTENSITY_CLASSES.length - 1)));
  return INTENSITY_CLASSES[bucket] ?? "bg-surface-2";
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { from, to, outletId, brandId, channel } = params;

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (outletId) query.set("outletId", outletId);
  if (brandId) query.set("brandId", brandId);
  if (channel) query.set("channel", channel);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const [
    brandsRes,
    outletsRes,
    weekdayRes,
    hourlyRes,
    heatmapRes,
    peakSlowRes,
    monthlyRes,
    brandDemandRes,
    outletDemandRes,
    channelDemandRes,
    recommendationsRes,
  ] = await Promise.all([
    apiFetch("/v1/brands"),
    apiFetch("/v1/outlets"),
    apiFetch(`/v1/reports/weekday-distribution${qs}`),
    apiFetch(`/v1/reports/hourly-distribution${qs}`),
    apiFetch(`/v1/reports/demand-heatmap${qs}`),
    apiFetch(`/v1/reports/peak-slow-hours${qs}`),
    apiFetch(`/v1/reports/monthly-trend${qs}`),
    apiFetch(`/v1/reports/brand-demand${qs}`),
    apiFetch(`/v1/reports/outlet-demand${qs}`),
    apiFetch(`/v1/reports/channel-demand${qs}`),
    apiFetch(`/v1/reports/promotion-recommendations${qs}`),
  ]);

  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const weekday: WeekdayRow[] = weekdayRes.ok ? await weekdayRes.json() : [];
  const hourly: HourlyRow[] = hourlyRes.ok ? await hourlyRes.json() : [];
  const heatmapCells: HeatmapCell[] = heatmapRes.ok ? await heatmapRes.json() : [];
  const peakSlow: PeakSlow | null = peakSlowRes.ok ? await peakSlowRes.json() : null;
  const monthly: MonthlyRow[] = monthlyRes.ok ? await monthlyRes.json() : [];
  const brandDemand: BrandDemandRow[] = brandDemandRes.ok ? await brandDemandRes.json() : [];
  const outletDemand: OutletDemandRow[] = outletDemandRes.ok ? await outletDemandRes.json() : [];
  const channelDemand: ChannelDemandRow[] = channelDemandRes.ok ? await channelDemandRes.json() : [];
  const recommendations: PromotionRecommendation[] = recommendationsRes.ok ? await recommendationsRes.json() : [];

  const heatmapByCell = new Map(heatmapCells.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]));
  const maxCellCount = heatmapCells.reduce((max, c) => Math.max(max, c.orderCount), 0);
  const maxWeekdayCount = weekday.reduce((max, w) => Math.max(max, w.orderCount), 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Demand Intelligence &amp; Sales Heatmaps</h1>
      <p className="mt-2 text-sm text-ink-2">
        Every figure below is computed on demand from PAID orders, the same reporting
        philosophy as <span className="font-medium">Reports</span>. Promotion recommendations are ranked by
        estimated contribution (revenue minus known cost of goods), not just how few orders a slot had — a
        quiet slot that&apos;s already thin-margin gets pointed toward a bundle upsell instead of a further
        discount.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <label className="block text-xs font-medium text-ink-2" htmlFor="from">
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={from?.slice(0, 10)}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2" htmlFor="to">
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={to?.slice(0, 10)}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2" htmlFor="brandId">
            Brand
          </label>
          <select
            id="brandId"
            name="brandId"
            defaultValue={brandId ?? ""}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2" htmlFor="outletId">
            Outlet
          </label>
          <select
            id="outletId"
            name="outletId"
            defaultValue={outletId ?? ""}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          >
            <option value="">All outlets</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2" htmlFor="channel">
            Channel
          </label>
          <select
            id="channel"
            name="channel"
            defaultValue={channel ?? ""}
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          >
            <option value="">All channels</option>
            <option value="DINE_IN">Dine-in</option>
            <option value="DELIVERY">Delivery</option>
            <option value="TAKEAWAY">Takeaway</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover">
          Apply filters
        </button>
      </form>

      {peakSlow ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Peak hour"
            value={peakSlow.peakHour ? `${String(peakSlow.peakHour.hour).padStart(2, "0")}:00` : "—"}
            sub={peakSlow.peakHour ? `${peakSlow.peakHour.orderCount} orders` : undefined}
            emphasize
          />
          <SummaryCard
            label="Slowest hour"
            value={peakSlow.slowHour ? `${String(peakSlow.slowHour.hour).padStart(2, "0")}:00` : "—"}
            sub={peakSlow.slowHour ? `${peakSlow.slowHour.orderCount} orders` : undefined}
          />
          <SummaryCard label="Brands" value={String(brandDemand.length)} />
          <SummaryCard label="Underperforming slots flagged" value={String(recommendations.length)} />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Weekday x hour demand heatmap</h2>
        <p className="mt-1 text-xs text-ink-2">Hover a cell for its exact order count and revenue.</p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface p-3">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-10" />
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={hour} className="w-6 text-[10px] font-normal text-ink-3">
                    {hour % 3 === 0 ? hour : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_SHORT.map((label, dayOfWeek) => (
                <tr key={dayOfWeek}>
                  <td className="pr-2 text-right text-xs font-medium text-ink-2">{label}</td>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = heatmapByCell.get(`${dayOfWeek}-${hour}`);
                    const count = cell?.orderCount ?? 0;
                    return (
                      <td
                        key={hour}
                        title={`${DAY_NAMES[dayOfWeek]} ${String(hour).padStart(2, "0")}:00 — ${count} order${count === 1 ? "" : "s"}, ₹${cell?.revenue ?? "0"}`}
                        className={`h-6 w-6 rounded ${intensityClass(count, maxCellCount)}`}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-2">
            <span>Fewer orders</span>
            {INTENSITY_CLASSES.map((cls) => (
              <span key={cls} className={`h-4 w-4 rounded ${cls}`} />
            ))}
            <span>More orders</span>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-ink">Weekday distribution</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Revenue</th>
                <th className="px-4 py-2">Avg. order value</th>
              </tr>
            </thead>
            <tbody>
              {weekday.map((row) => (
                <tr key={row.dayOfWeek} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{DAY_NAMES[row.dayOfWeek]}</td>
                  <td className="px-4 py-2 text-ink-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded bg-surface-2">
                        <div
                          className="h-2 rounded bg-brand"
                          style={{ width: maxWeekdayCount > 0 ? `${(row.orderCount / maxWeekdayCount) * 100}%` : "0%" }}
                        />
                      </div>
                      {row.orderCount}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                  <td className="px-4 py-2 text-ink-2">₹{row.averageOrderValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Seasonal trend (by month)</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((row) => (
                <tr key={row.month} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.month}</td>
                  <td className="px-4 py-2 text-ink-2">{row.orderCount}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                    No revenue in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Brand-wise demand</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Brand</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {brandDemand.map((row) => (
                <tr key={row.brandId} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.brandName}</td>
                  <td className="px-4 py-2 text-ink-2">{row.orderCount}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Outlet-wise demand</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Outlet</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {outletDemand.map((row) => (
                <tr key={row.outletId} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.outletName}</td>
                  <td className="px-4 py-2 text-ink-2">{row.orderCount}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Channel-wise demand</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {channelDemand.map((row) => (
                <tr key={row.channel} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.channel.replace("_", "-")}</td>
                  <td className="px-4 py-2 text-ink-2">{row.orderCount}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Promotion recommendations</h2>
          <p className="mt-1 text-xs text-ink-2">Underperforming slots, ranked by order count, with a contribution-aware suggestion.</p>
          <div className="mt-2 space-y-2">
            {recommendations.map((rec) => (
              <div key={`${rec.dayOfWeek}-${rec.hour}`} className="rounded-lg border border-line bg-surface p-3 text-sm">
                <div className="font-medium text-ink">
                  {DAY_NAMES[rec.dayOfWeek]} {String(rec.hour).padStart(2, "0")}:00 — {rec.orderCount} order
                  {rec.orderCount === 1 ? "" : "s"}
                </div>
                <div className="mt-1 text-xs text-ink-2">
                  Revenue ₹{rec.revenue} · Est. contribution ₹{rec.estimatedContribution} (₹{rec.contributionPerOrder}/order)
                </div>
                <div className="mt-1 text-ink-2">{rec.suggestion}</div>
              </div>
            ))}
            {recommendations.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-3">
                No underperforming slots flagged in this range.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, emphasize }: { label: string; value: string; sub?: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasize ? "text-ink" : "text-ink"}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}
