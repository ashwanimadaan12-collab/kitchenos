import { apiFetch } from "@/lib/api";
import { ExportExcel } from "./export-excel";

interface Brand {
  id: string;
  name: string;
}

interface Outlet {
  id: string;
  name: string;
  brandId: string;
}

interface SalesSummary {
  orderCount: number;
  subtotal: string;
  taxTotal: string;
  discountAmount: string;
  total: string;
  averageOrderValue: string;
}

interface SalesByDayRow {
  date: string;
  total: string;
}

interface TopProductRow {
  variantId: string;
  productName: string;
  variantName: string;
  quantitySold: number;
  revenue: string;
}

interface ComboPerformanceRow {
  comboId: string;
  name: string;
  instancesSold: number;
  revenue: string;
}

interface PaymentMethodRow {
  method: string;
  count: number;
  amount: string;
}

interface PromotionUsageRow {
  promotionId: string;
  code: string;
  redemptions: number;
  totalDiscount: string;
}

interface ProfitLoss {
  revenue: string;
  expenses: string;
  netProfit: string;
}

export default async function ReportsPage({
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

  const [brandsRes, outletsRes, summaryRes, byDayRes, topProductsRes, comboRes, paymentsRes, promotionsRes, profitLossRes] =
    await Promise.all([
      apiFetch("/v1/brands"),
      apiFetch("/v1/outlets"),
      apiFetch(`/v1/reports/sales-summary${qs}`),
      apiFetch(`/v1/reports/sales-by-day${qs}`),
      apiFetch(`/v1/reports/top-products${qs}`),
      apiFetch(`/v1/reports/combo-performance${qs}`),
      apiFetch(`/v1/reports/payment-methods${qs}`),
      apiFetch(`/v1/reports/promotions${qs}`),
      apiFetch(`/v1/reports/profit-loss${qs}`),
    ]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const summary: SalesSummary | null = summaryRes.ok ? await summaryRes.json() : null;
  const byDay: SalesByDayRow[] = byDayRes.ok ? await byDayRes.json() : [];
  const topProducts: TopProductRow[] = topProductsRes.ok ? await topProductsRes.json() : [];
  const comboPerformance: ComboPerformanceRow[] = comboRes.ok ? await comboRes.json() : [];
  const paymentMethods: PaymentMethodRow[] = paymentsRes.ok ? await paymentsRes.json() : [];
  const promotionUsage: PromotionUsageRow[] = promotionsRes.ok ? await promotionsRes.json() : [];
  const profitLoss: ProfitLoss | null = profitLossRes.ok ? await profitLossRes.json() : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Reports</h1>
        <ExportExcel outletId={outletId} brandId={brandId} />
      </div>
      <p className="mt-2 text-sm text-ink-2">
        Computed on demand from PAID orders — open or voided orders never count toward revenue.
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

      {summary ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Orders" value={String(summary.orderCount)} />
          <SummaryCard label="Subtotal" value={`₹${summary.subtotal}`} />
          <SummaryCard label="Tax" value={`₹${summary.taxTotal}`} />
          <SummaryCard label="Discounts" value={`₹${summary.discountAmount}`} />
          <SummaryCard label="Total revenue" value={`₹${summary.total}`} emphasize />
          <SummaryCard label="Avg. order value" value={`₹${summary.averageOrderValue}`} />
        </div>
      ) : null}

      {profitLoss ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <SummaryCard label="Revenue" value={`₹${profitLoss.revenue}`} />
          <SummaryCard label="Expenses" value={`₹${profitLoss.expenses}`} />
          <SummaryCard label="Net profit" value={`₹${profitLoss.netProfit}`} emphasize />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Revenue by day</h2>
        <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((row) => (
              <tr key={row.date} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{row.date}</td>
                <td className="px-4 py-2 text-ink">₹{row.total}</td>
              </tr>
            ))}
            {byDay.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-ink-3">
                  No revenue in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-ink">Top-selling products</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Qty</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((row) => (
                <tr key={row.variantId} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">
                    {row.productName} ({row.variantName})
                  </td>
                  <td className="px-4 py-2 text-ink-2">{row.quantitySold}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
              {topProducts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                    Nothing sold in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Combo performance</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Combo</th>
                <th className="px-4 py-2">Sold</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {comboPerformance.map((row) => (
                <tr key={row.comboId} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-2 text-ink-2">{row.instancesSold}</td>
                  <td className="px-4 py-2 text-ink">₹{row.revenue}</td>
                </tr>
              ))}
              {comboPerformance.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                    No combos sold in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Payment methods</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Count</th>
                <th className="px-4 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((row) => (
                <tr key={row.method} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.method}</td>
                  <td className="px-4 py-2 text-ink-2">{row.count}</td>
                  <td className="px-4 py-2 text-ink">₹{row.amount}</td>
                </tr>
              ))}
              {paymentMethods.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                    No payments in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink">Promotion usage</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
            <thead className="bg-surface-2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Redemptions</th>
                <th className="px-4 py-2">Discount given</th>
              </tr>
            </thead>
            <tbody>
              {promotionUsage.map((row) => (
                <tr key={row.promotionId} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{row.code}</td>
                  <td className="px-4 py-2 text-ink-2">{row.redemptions}</td>
                  <td className="px-4 py-2 text-ink">₹{row.totalDiscount}</td>
                </tr>
              ))}
              {promotionUsage.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                    No promotions redeemed in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasize ? "text-ink" : "text-ink"}`}>{value}</div>
    </div>
  );
}
