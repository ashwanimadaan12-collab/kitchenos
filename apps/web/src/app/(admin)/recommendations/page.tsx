import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { MinimumPriceTool } from "./minimum-price-tool";

interface DiscountCandidate {
  variantId: string;
  productName: string;
  variantName: string;
  basePrice: string;
  quantitySoldLast90Days: number;
  marginPercent: string | null;
  minimumProfitablePrice: string | null;
  suggestedDiscountPercent: number | null;
}

interface ComboCandidate {
  comboId: string;
  name: string;
  comboPrice: string;
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

interface CampaignResult {
  campaignId: string;
  name: string;
  type: string;
  status: string;
  stats: { targeted: number; converted: number; conversionRate: number; revenueAttributed: string };
}

interface Product {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
}

export default async function RecommendationsPage() {
  const [discountRes, comboRes, segmentRes, campaignRes, productsRes] = await Promise.all([
    apiFetch("/v1/promotions/recommendations/discount-candidates"),
    apiFetch("/v1/promotions/recommendations/combo-candidates"),
    apiFetch("/v1/promotions/recommendations/segment-candidates"),
    apiFetch("/v1/promotions/recommendations/campaign-results"),
    apiFetch("/v1/products"),
  ]);

  const discountCandidates: DiscountCandidate[] = discountRes.ok ? await discountRes.json() : [];
  const comboCandidates: ComboCandidate[] = comboRes.ok ? await comboRes.json() : [];
  const segmentCandidates: SegmentCandidate[] = segmentRes.ok ? await segmentRes.json() : [];
  const campaignResults: CampaignResult[] = campaignRes.ok ? await campaignRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const variants = products.flatMap((p) => p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}` })));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Smart Promotion Recommendations</h1>
      <p className="mt-2 text-sm text-slate-600">
        Almost everything below is reuse: slow days and time slots live on <Link href="/demand" className="underline">Demand</Link>,
        and every campaign&apos;s own A/B lift lives on its detail page under <Link href="/campaigns" className="underline">Campaigns</Link>.
        What&apos;s new here is ranking products and combos as discount/promotion candidates by demand and margin
        together — a slow seller only makes the list if discounting it still leaves a healthy margin — and rolling
        every completed campaign&apos;s results into one ranked view.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Minimum profitable selling price</h2>
        <p className="mt-1 text-xs text-slate-500">
          The floor the configured minimum-margin safeguard implies for any variant — the same number the pricing
          engine itself enforces when a discount rule is created.
        </p>
        <div className="mt-3">
          <MinimumPriceTool variants={variants} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700">Which products to discount</h2>
        <p className="mt-1 text-xs text-slate-500">
          Slow-selling, healthy-margin products (90-day window) — the suggested discount is already capped at the
          margin floor, never above it.
        </p>
        <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Sold (90d)</th>
              <th className="px-4 py-2">Margin</th>
              <th className="px-4 py-2">Suggested discount</th>
              <th className="px-4 py-2">Min. profitable price</th>
            </tr>
          </thead>
          <tbody>
            {discountCandidates.map((c) => (
              <tr key={c.variantId} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">
                  {c.productName} ({c.variantName})
                </td>
                <td className="px-4 py-2 text-slate-500">{c.quantitySoldLast90Days}</td>
                <td className="px-4 py-2 text-slate-500">{c.marginPercent}%</td>
                <td className="px-4 py-2 text-slate-900">{c.suggestedDiscountPercent}%</td>
                <td className="px-4 py-2 text-slate-500">{c.minimumProfitablePrice ? `₹${c.minimumProfitablePrice}` : "—"}</td>
              </tr>
            ))}
            {discountCandidates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No slow-but-healthy-margin products found right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700">Which combos to promote</h2>
        <p className="mt-1 text-xs text-slate-500">Fewest instances sold in the last 90 days, first.</p>
        <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Combo</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Sold (90d)</th>
              <th className="px-4 py-2">Revenue (90d)</th>
            </tr>
          </thead>
          <tbody>
            {comboCandidates.map((c) => (
              <tr key={c.comboId} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-2 text-slate-500">₹{c.comboPrice}</td>
                <td className="px-4 py-2 text-slate-500">{c.instancesSoldLast90Days}</td>
                <td className="px-4 py-2 text-slate-500">₹{c.revenueLast90Days}</td>
              </tr>
            ))}
            {comboCandidates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No combos configured yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-slate-700">Which customer segments to target</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Segment</th>
                <th className="px-4 py-2">Customers</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {segmentCandidates.map((s) => (
                <tr key={s.segmentId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-2 text-slate-500">{s.customerCount}</td>
                  <td className="px-4 py-2">
                    {s.recommended ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Recommended</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-700">Historical campaign results</h2>
          <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2">Conv. rate</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {campaignResults.map((c) => (
                <tr key={c.campaignId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <Link href={`/campaigns/${c.campaignId}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{c.stats.conversionRate}%</td>
                  <td className="px-4 py-2 text-slate-500">₹{c.stats.revenueAttributed}</td>
                </tr>
              ))}
              {campaignResults.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No completed or running campaigns yet.
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
