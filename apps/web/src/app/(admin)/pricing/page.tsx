import { apiFetch } from "@/lib/api";
import { PricingSettingsForm } from "./pricing-settings-form";
import { CreatePricingRuleForm } from "./create-pricing-rule-form";
import { ToggleRuleActiveButton } from "./toggle-rule-active-button";
import { QuoteTool } from "./quote-tool";

interface Product {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
}

interface Outlet {
  id: string;
  name: string;
}

interface PricingRule {
  id: string;
  label: string;
  category: string;
  variant: { id: string; name: string } | null;
  outlet: { id: string; name: string } | null;
  channel: string | null;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: string | null;
  validTo: string | null;
  adjustmentType: string;
  adjustmentValue: string;
  priority: number;
  isActive: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ADJUSTMENT_LABEL: Record<string, string> = {
  FIXED_PRICE: "→",
  PERCENT_DISCOUNT: "-% ",
  FLAT_DISCOUNT: "-₹",
  PERCENT_SURCHARGE: "+% ",
  FLAT_SURCHARGE: "+₹",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [settingsRes, rulesRes, productsRes, outletsRes] = await Promise.all([
    apiFetch("/v1/pricing/settings"),
    apiFetch("/v1/pricing/rules"),
    apiFetch("/v1/products"),
    apiFetch("/v1/outlets"),
  ]);
  const settings = await settingsRes.json();
  const rules: PricingRule[] = rulesRes.ok ? await rulesRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];

  const variants = products.flatMap((p) => p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}` })));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dynamic Pricing</h1>
      <p className="mt-2 text-sm text-ink-2">
        Rules layer on top of each outlet&apos;s resolved base price (its own override, or the variant&apos;s base
        price) — time/weekend/festival windows, channel- or outlet-specific adjustments, and scheduled discounts
        all share one mechanism. A retail commodity&apos;s printed MRP is always a ceiling; the minimum margin
        below is a floor applied only when a cost is known. Every quote locks in permanently the moment it&apos;s
        added to an order — a later rule change never rewrites a confirmed line.
      </p>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Minimum contribution protection</h2>
        <div className="mt-3">
          <PricingSettingsForm minimumMarginPercent={settings.minimumMarginPercent} />
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Try a quote</h2>
        <div className="mt-3">
          <QuoteTool variants={variants} outlets={outlets} />
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Pricing rules</h2>
        <div className="mt-3">
          <CreatePricingRuleForm variants={variants} outlets={outlets} defaultVariantId={params.variantId} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Window</th>
              <th className="px-4 py-2">Adjustment</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{rule.label}</td>
                <td className="px-4 py-2 text-ink-2">{rule.category.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-ink-2">
                  {rule.variant?.name ?? "All variants"} · {rule.outlet?.name ?? "All outlets"} · {rule.channel ?? "All channels"}
                </td>
                <td className="px-4 py-2 text-ink-2">
                  {rule.daysOfWeek.length > 0 ? rule.daysOfWeek.map((d) => DAY_LABELS[d]).join("/") : "Every day"}
                  {rule.startTime || rule.endTime ? ` ${rule.startTime ?? "00:00"}–${rule.endTime ?? "24:00"}` : ""}
                  {rule.validFrom || rule.validTo
                    ? ` (${rule.validFrom ? new Date(rule.validFrom).toLocaleDateString() : "…"}–${
                        rule.validTo ? new Date(rule.validTo).toLocaleDateString() : "…"
                      })`
                    : ""}
                </td>
                <td className="px-4 py-2 text-ink-2">
                  {ADJUSTMENT_LABEL[rule.adjustmentType]}
                  {rule.adjustmentValue} (priority {rule.priority})
                </td>
                <td className="px-4 py-2">{rule.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-2 text-right">
                  <ToggleRuleActiveButton ruleId={rule.id} isActive={rule.isActive} />
                </td>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-3">
                  No pricing rules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
