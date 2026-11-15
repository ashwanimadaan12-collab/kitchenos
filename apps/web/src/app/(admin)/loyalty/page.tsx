import { apiFetch } from "@/lib/api";
import { ProgramSettingsForm } from "./program-settings-form";
import { CreateTierForm } from "./create-tier-form";
import { BrandRuleRow } from "./brand-rule-row";

interface Settings {
  earningRate: string;
  redemptionRatio: string;
  welcomeBonusPoints: number;
  referralBonusPoints: number;
  birthdayBonusPoints: number;
  pointsExpiryDays: number | null;
}

interface Tier {
  id: string;
  name: string;
  minLifetimePoints: number;
  earningMultiplier: string;
  sortOrder: number;
}

interface Brand {
  id: string;
  name: string;
}

interface BrandRule {
  earningRate: string | null;
  redemptionRatio: string | null;
}

export default async function LoyaltyPage() {
  const [settingsRes, tiersRes, brandsRes] = await Promise.all([
    apiFetch("/v1/loyalty/settings"),
    apiFetch("/v1/loyalty/tiers"),
    apiFetch("/v1/brands"),
  ]);
  const settings: Settings = await settingsRes.json();
  const tiers: Tier[] = tiersRes.ok ? await tiersRes.json() : [];
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];

  const brandRules = await Promise.all(
    brands.map(async (brand) => {
      const res = await apiFetch(`/v1/loyalty/brand-rules/${brand.id}`);
      // No override configured yet comes back as a 200 with an empty body, not JSON `null`.
      const text = res.ok ? await res.text() : "";
      const rule: BrandRule | null = text ? JSON.parse(text) : null;
      return { brand, rule };
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Loyalty &amp; Rewards</h1>
      <p className="mt-2 text-sm text-slate-600">
        Points are earned on every paid order, debited the moment they&apos;re redeemed (never changed after the
        fact — every change is an append-only ledger entry), and expire after the configured window if set. A
        customer&apos;s membership tier is derived from lifetime points earned, which redemption never reduces.
      </p>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Program settings</h2>
        <div className="mt-3">
          <ProgramSettingsForm settings={settings} />
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Membership tiers</h2>
        <div className="mt-3">
          <CreateTierForm />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Min. lifetime points</th>
              <th className="px-4 py-2">Earning multiplier</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{tier.name}</td>
                <td className="px-4 py-2 text-slate-500">{tier.minLifetimePoints}</td>
                <td className="px-4 py-2 text-slate-500">{tier.earningMultiplier}×</td>
              </tr>
            ))}
            {tiers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No membership tiers yet — every customer earns at the base rate.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Brand-specific rates</h2>
        <p className="mt-1 text-xs text-slate-500">Leave blank to use the organization default shown above.</p>
        <table className="mt-3 w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Earning rate</th>
              <th className="px-4 py-2">Redemption ratio</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {brandRules.map(({ brand, rule }) => (
              <BrandRuleRow
                key={brand.id}
                brandId={brand.id}
                brandName={brand.name}
                earningRate={rule?.earningRate ?? null}
                redemptionRatio={rule?.redemptionRatio ?? null}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
