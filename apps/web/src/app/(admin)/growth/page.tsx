import { apiFetch } from "@/lib/api";

interface Brand {
  id: string;
  name: string;
}

interface Outlet {
  id: string;
  name: string;
  brandId: string;
}

interface Kitchen {
  id: string;
  name: string;
}

interface ProfitabilityRow {
  revenue: string;
  cogs: string;
  expenses: string;
  profit: string;
}

interface BrandProfitability extends ProfitabilityRow {
  brandId: string;
  brandName: string;
}

interface OutletProfitability extends ProfitabilityRow {
  outletId: string;
  outletName: string;
}

interface ProductPerformanceRow {
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
  reorderQuantitySuggested: string;
}

interface DiscountCandidate {
  variantId: string;
  productName: string;
  variantName: string;
  marginPercent: string | null;
  suggestedDiscountPercent: number;
}

interface ComboCandidate {
  comboId: string;
  name: string;
  instancesSoldLast90Days: number;
  revenueLast90Days: string;
}

interface SegmentCandidate {
  segmentId: string;
  name: string;
  type: string;
  customerCount: number;
  recommended: boolean;
}

interface GrowthDashboard {
  totalRevenue: string;
  totalContribution: string;
  brandProfitability: BrandProfitability[];
  outletProfitability: OutletProfitability[];
  productPerformance: ProductPerformanceRow[];
  customerRepeatRate: { totalCustomers: number; repeatCustomers: number; repeatRatePercent: number };
  loyaltyPointLiability: { totalPoints: number; redemptionRatio: string; estimatedLiability: string };
  campaignROI: {
    whatsapp: { revenue: string; cost: string; roiPercent: string | null };
    sms: { revenue: string; cost: string; roiPercent: string | null; note: string };
  };
  bestSalesDay: { dayOfWeek: number; orderCount: number; revenue: string };
  peakSalesHour: { hour: number; orderCount: number; revenue: string } | null;
  lowDemandPeriods: {
    slowestHour: { hour: number; orderCount: number; revenue: string } | null;
    quietSlots: { dayOfWeek: number; hour: number; orderCount: number; suggestion: string }[];
  };
  stockoutRisks: IngredientForecastRow[];
  purchaseRecommendations: IngredientForecastRow[];
  promotionOpportunities: {
    discountCandidates: DiscountCandidate[];
    comboCandidates: ComboCandidate[];
    segmentCandidates: SegmentCandidate[];
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function GrowthDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { from, to, outletId, brandId, kitchenId, channel } = params;

  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (outletId) query.set("outletId", outletId);
  if (brandId) query.set("brandId", brandId);
  if (kitchenId) query.set("kitchenId", kitchenId);
  if (channel) query.set("channel", channel);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const [brandsRes, outletsRes, kitchensRes, dashboardRes] = await Promise.all([
    apiFetch("/v1/brands"),
    apiFetch("/v1/outlets"),
    apiFetch("/v1/kitchens"),
    apiFetch(`/v1/dashboard/growth${qs}`),
  ]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const kitchens: Kitchen[] = kitchensRes.ok ? await kitchensRes.json() : [];
  const dashboard: GrowthDashboard | null = dashboardRes.ok ? await dashboardRes.json() : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Growth Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Every figure below reconciles with the underlying orders, inventory and financial reports — drill down by
        brand, outlet, kitchen or channel using the filters.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <Field id="from" label="From" defaultValue={from?.slice(0, 10)} type="date" />
        <Field id="to" label="To" defaultValue={to?.slice(0, 10)} type="date" />
        <SelectField id="brandId" label="Brand" defaultValue={brandId} placeholder="All brands" options={brands.map((b) => ({ value: b.id, label: b.name }))} />
        <SelectField id="outletId" label="Outlet" defaultValue={outletId} placeholder="All outlets" options={outlets.map((o) => ({ value: o.id, label: o.name }))} />
        <SelectField id="kitchenId" label="Kitchen" defaultValue={kitchenId} placeholder="All kitchens" options={kitchens.map((k) => ({ value: k.id, label: k.name }))} />
        <SelectField
          id="channel"
          label="Channel"
          defaultValue={channel}
          placeholder="All channels"
          options={[
            { value: "DINE_IN", label: "Dine-in" },
            { value: "DELIVERY", label: "Delivery" },
            { value: "TAKEAWAY", label: "Takeaway" },
          ]}
        />
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Apply filters
        </button>
      </form>

      {!dashboard ? (
        <p className="mt-6 text-sm text-red-600">Could not load the dashboard.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Total revenue" value={`₹${dashboard.totalRevenue}`} emphasize />
            <SummaryCard label="Total contribution" value={`₹${dashboard.totalContribution}`} />
            <SummaryCard label="Customer repeat rate" value={`${dashboard.customerRepeatRate.repeatRatePercent}%`} />
            <SummaryCard label="Loyalty point liability" value={`₹${dashboard.loyaltyPointLiability.estimatedLiability}`} />
            <SummaryCard label="Best sales day" value={DAY_NAMES[dashboard.bestSalesDay.dayOfWeek] ?? "—"} />
            <SummaryCard label="Peak sales hour" value={dashboard.peakSalesHour ? `${dashboard.peakSalesHour.hour}:00` : "—"} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">WhatsApp campaign ROI</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {dashboard.campaignROI.whatsapp.roiPercent !== null ? `${dashboard.campaignROI.whatsapp.roiPercent}%` : "—"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Revenue ₹{dashboard.campaignROI.whatsapp.revenue} − cost ₹{dashboard.campaignROI.whatsapp.cost}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">SMS campaign ROI</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">—</div>
              <div className="mt-1 text-xs text-slate-500">{dashboard.campaignROI.sms.note}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-sm font-semibold text-slate-700">Brand profitability</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Brand</th>
                    <th className="px-4 py-2">Revenue</th>
                    <th className="px-4 py-2">COGS</th>
                    <th className="px-4 py-2">Expenses</th>
                    <th className="px-4 py-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.brandProfitability.map((row) => (
                    <tr key={row.brandId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.brandName}</td>
                      <td className="px-4 py-2 text-slate-900">₹{row.revenue}</td>
                      <td className="px-4 py-2 text-slate-500">₹{row.cogs}</td>
                      <td className="px-4 py-2 text-slate-500">₹{row.expenses}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">₹{row.profit}</td>
                    </tr>
                  ))}
                  {dashboard.brandProfitability.length === 0 ? <EmptyRow colSpan={5} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Outlet profitability</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Outlet</th>
                    <th className="px-4 py-2">Revenue</th>
                    <th className="px-4 py-2">COGS</th>
                    <th className="px-4 py-2">Expenses</th>
                    <th className="px-4 py-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.outletProfitability.map((row) => (
                    <tr key={row.outletId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.outletName}</td>
                      <td className="px-4 py-2 text-slate-900">₹{row.revenue}</td>
                      <td className="px-4 py-2 text-slate-500">₹{row.cogs}</td>
                      <td className="px-4 py-2 text-slate-500">₹{row.expenses}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">₹{row.profit}</td>
                    </tr>
                  ))}
                  {dashboard.outletProfitability.length === 0 ? <EmptyRow colSpan={5} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Product performance</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.productPerformance.map((row) => (
                    <tr key={row.variantId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {row.productName} ({row.variantName})
                      </td>
                      <td className="px-4 py-2 text-slate-500">{row.quantitySold}</td>
                      <td className="px-4 py-2 text-slate-900">₹{row.revenue}</td>
                    </tr>
                  ))}
                  {dashboard.productPerformance.length === 0 ? <EmptyRow colSpan={3} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Low-demand slots (promotion-worthy)</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Slot</th>
                    <th className="px-4 py-2">Orders</th>
                    <th className="px-4 py-2">Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.lowDemandPeriods.quietSlots.map((slot, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {DAY_NAMES[slot.dayOfWeek]} {slot.hour}:00
                      </td>
                      <td className="px-4 py-2 text-slate-500">{slot.orderCount}</td>
                      <td className="px-4 py-2 text-slate-600">{slot.suggestion}</td>
                    </tr>
                  ))}
                  {dashboard.lowDemandPeriods.quietSlots.length === 0 ? <EmptyRow colSpan={3} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Stockout risks</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Ingredient</th>
                    <th className="px-4 py-2">Days of stock</th>
                    <th className="px-4 py-2">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.stockoutRisks.map((row) => (
                    <tr key={`${row.kitchenId}-${row.ingredientId}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.ingredientName}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {row.daysOfStockRemaining !== null ? row.daysOfStockRemaining.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-900">{row.stockoutRisk}</td>
                    </tr>
                  ))}
                  {dashboard.stockoutRisks.length === 0 ? <EmptyRow colSpan={3} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Purchase recommendations</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Ingredient</th>
                    <th className="px-4 py-2">Suggested qty</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.purchaseRecommendations.map((row) => (
                    <tr key={`${row.kitchenId}-${row.ingredientId}`} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.ingredientName}</td>
                      <td className="px-4 py-2 text-slate-900">{row.reorderQuantitySuggested}</td>
                    </tr>
                  ))}
                  {dashboard.purchaseRecommendations.length === 0 ? <EmptyRow colSpan={2} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Discount candidates</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Margin</th>
                    <th className="px-4 py-2">Suggested discount</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.promotionOpportunities.discountCandidates.map((row) => (
                    <tr key={row.variantId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {row.productName} ({row.variantName})
                      </td>
                      <td className="px-4 py-2 text-slate-500">{row.marginPercent ?? "—"}%</td>
                      <td className="px-4 py-2 text-slate-900">{row.suggestedDiscountPercent}%</td>
                    </tr>
                  ))}
                  {dashboard.promotionOpportunities.discountCandidates.length === 0 ? <EmptyRow colSpan={3} /> : null}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-700">Combo &amp; segment opportunities</h2>
              <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.promotionOpportunities.comboCandidates.map((row) => (
                    <tr key={row.comboId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-2 text-slate-500">{row.instancesSoldLast90Days} sold in 90d</td>
                    </tr>
                  ))}
                  {dashboard.promotionOpportunities.segmentCandidates.map((row) => (
                    <tr key={row.segmentId} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {row.customerCount} customers{row.recommended ? " — recommended" : ""}
                      </td>
                    </tr>
                  ))}
                  {dashboard.promotionOpportunities.comboCandidates.length === 0 &&
                  dashboard.promotionOpportunities.segmentCandidates.length === 0 ? (
                    <EmptyRow colSpan={2} />
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${emphasize ? "text-slate-900" : "text-slate-700"}`}>{value}</div>
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-slate-400">
        Nothing to show for this range.
      </td>
    </tr>
  );
}

function Field({ id, label, defaultValue, type }: { id: string; label: string; defaultValue?: string; type: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        name={id}
        defaultValue={defaultValue}
        className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  defaultValue,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  defaultValue?: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue ?? ""}
        className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
