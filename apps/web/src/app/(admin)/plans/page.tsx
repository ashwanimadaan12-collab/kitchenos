import { Badge, Card, Icon } from "@kitchenos/ui";
import {
  DEFAULT_PLAN_ID,
  FEATURE_LABEL,
  PLANS,
  TRIAL_DAYS,
  getPlan,
  isTrialActive,
  type Feature,
} from "@kitchenos/shared";
import { getActiveOrganizationId, getSession } from "@/lib/session";

/**
 * The plan ladder, rendered straight from the shared PLANS table so the app and
 * any price list always agree.
 */
const ROWS: Feature[] = [
  "pos_billing",
  "kot_print",
  "basic_reports",
  "order_alarm",
  "excel_export",
  "insights",
  "qr_ordering",
  "kds",
  "inventory",
  "recipe_costing",
  "loyalty",
  "campaigns",
  "whatsapp",
  "aggregator_reconciliation",
  "multi_outlet",
  "api_access",
];

function rupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function limitText(n: number): string {
  return n >= 9999 ? "Unlimited" : String(n);
}

export default async function PlansPage() {
  const [session, activeOrgId] = await Promise.all([getSession(), getActiveOrganizationId()]);
  const membership =
    session?.memberships.find((m) => m.organizationId === activeOrgId) ?? session?.memberships[0];
  const current = getPlan(membership?.plan ?? DEFAULT_PLAN_ID);
  const onTrial = isTrialActive(membership?.trialEndsAt ?? null);
  const trialEnds = membership?.trialEndsAt ? new Date(membership.trialEndsAt) : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Plans</h1>
        <p className="mt-1 text-sm text-ink-2">
          Saare plan me {TRIAL_DAYS} din free trial — card ki zaroorat nahi. Price saal ka hai, GST alag.
        </p>
      </header>

      {onTrial && trialEnds ? (
        <div className="rounded-card border border-warn-line bg-warn-tint p-5">
          <h2 className="font-display text-base font-bold text-warn">
            Trial chalu hai — abhi sab kuch khula hai
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {trialEnds.toLocaleDateString("en-IN", { day: "numeric", month: "long" })} tak. Uske baad{" "}
            {current.name} plan ke features rahenge.
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === current.id;
          return (
            <Card
              key={plan.id}
              className={isCurrent ? "border-2 border-brand" : ""}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl font-bold text-ink">{plan.name}</h2>
                {isCurrent ? <Badge tone="brand">Abhi yahi</Badge> : null}
              </div>
              <p className="mt-1 min-h-10 text-sm text-ink-2">{plan.tagline}</p>
              <p className="tnum mt-3 font-display text-[34px] font-bold leading-none tracking-tight text-ink">
                {rupees(plan.pricePerYear)}
                <span className="ml-1 text-sm font-semibold text-ink-2">/ saal</span>
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm text-ink-2">
                <li>
                  Outlet: <strong className="text-ink">{limitText(plan.limits.outlets)}</strong>
                </li>
                <li>
                  Staff login: <strong className="text-ink">{limitText(plan.limits.users)}</strong>
                </li>
                <li>
                  WhatsApp:{" "}
                  <strong className="text-ink">
                    {plan.limits.whatsappMessagesPerMonth === 0
                      ? "Nahi"
                      : `${plan.limits.whatsappMessagesPerMonth.toLocaleString("en-IN")} msg / mahina`}
                  </strong>
                </li>
              </ul>
            </Card>
          );
        })}
      </section>

      <Card padding="flush">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Plan ke hisaab se features</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-2">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className="px-4 py-3 text-center text-[11.5px] font-bold uppercase tracking-wide text-ink-2"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((feature) => (
                <tr key={feature} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium text-ink">{FEATURE_LABEL[feature]}</td>
                  {PLANS.map((p) => {
                    const on = p.features.includes(feature);
                    return (
                      <td key={p.id} className="px-4 py-2.5 text-center">
                        {on ? (
                          <span className="inline-flex text-good">
                            <Icon name="order" size={16} title={`${FEATURE_LABEL[feature]}: hai`} />
                          </span>
                        ) : (
                          <span className="text-ink-3" aria-label={`${FEATURE_LABEL[feature]}: nahi`}>
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-ink-2">
        Plan badalne ka button tab aayega jab payment gateway judega. Prices aur limits{" "}
        <code>packages/shared/src/plans.ts</code> se aate hain — wahan badlo, poora app follow karega.
      </p>
    </div>
  );
}
