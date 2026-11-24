/**
 * Subscription plans, as data.
 *
 * Prices and limits move while a product is finding its market, and they are
 * quoted on a website, inside the app and in the API's limit checks. Keeping
 * them in one exported table means changing a price is editing one line here,
 * not hunting through screens.
 *
 * Prices are rupees per year, excluding GST — the same basis competitors quote
 * on, so the comparison a buyer makes is like for like.
 */

export type PlanId = "chhota" | "dukaan" | "pro";

/** A capability a plan either includes or does not. Checked by name, never by
 *  comparing plan ids, so a new plan slots in without touching call sites. */
export type Feature =
  | "pos_billing"
  | "kot_print"
  | "basic_reports"
  | "excel_export"
  | "order_alarm"
  | "insights"
  | "qr_ordering"
  | "kds"
  | "inventory"
  | "recipe_costing"
  | "loyalty"
  | "campaigns"
  | "whatsapp"
  | "aggregator_reconciliation"
  | "multi_outlet"
  | "api_access";

export interface PlanLimits {
  outlets: number;
  /** Staff logins. Terminals are not counted: a counter and a captain's phone
   *  signed in as the same cashier is one seat, which is how a small place works. */
  users: number;
  /** Billable WhatsApp messages included per month. Meta charges per message,
   *  so this is a real cost ceiling, not a soft nudge. 0 means the channel is off. */
  whatsappMessagesPerMonth: number;
  tables: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  pricePerYear: number;
  limits: PlanLimits;
  features: Feature[];
}

const UNLIMITED = 9999;

export const PLANS: Plan[] = [
  {
    id: "chhota",
    name: "Chhota",
    tagline: "Copy-register chhodo. Billing, KOT aur roz ka hisaab.",
    pricePerYear: 999,
    limits: { outlets: 1, users: 2, whatsappMessagesPerMonth: 0, tables: 12 },
    features: ["pos_billing", "kot_print", "basic_reports", "order_alarm"],
  },
  {
    id: "dukaan",
    name: "Dukaan",
    tagline: "QR se order, kitchen screen, stock aur dhandhe ki report.",
    pricePerYear: 3999,
    limits: { outlets: 1, users: 8, whatsappMessagesPerMonth: 0, tables: UNLIMITED },
    features: [
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
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Zomato/Swiggy ka asli P&L, loyalty, WhatsApp aur multi-outlet.",
    pricePerYear: 8999,
    limits: { outlets: UNLIMITED, users: UNLIMITED, whatsappMessagesPerMonth: 2000, tables: UNLIMITED },
    features: [
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
    ],
  },
];

export const DEFAULT_PLAN_ID: PlanId = "chhota";

/** Days a new workspace gets everything, with no card asked for. A small owner
 *  will not pay before seeing their own menu and their own numbers in it. */
export const TRIAL_DAYS = 14;

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function getPlan(id: string | null | undefined): Plan {
  return BY_ID.get((id ?? "") as PlanId) ?? BY_ID.get(DEFAULT_PLAN_ID)!;
}

/** During a trial every feature is on, so the owner sees what they would be
 *  buying rather than a wall of locks. */
export function isTrialActive(trialEndsAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!trialEndsAt) return false;
  const ends = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  return Number.isFinite(ends.getTime()) && ends.getTime() > now.getTime();
}

export interface PlanContext {
  planId: string | null | undefined;
  trialEndsAt?: Date | string | null;
}

export function hasFeature(ctx: PlanContext, feature: Feature, now = new Date()): boolean {
  if (isTrialActive(ctx.trialEndsAt, now)) return true;
  return getPlan(ctx.planId).features.includes(feature);
}

/** The cheapest plan that includes a feature — what an upgrade prompt should name. */
export function cheapestPlanWith(feature: Feature): Plan | null {
  return (
    [...PLANS].sort((a, b) => a.pricePerYear - b.pricePerYear).find((p) => p.features.includes(feature)) ?? null
  );
}

export function isWithinLimit(ctx: PlanContext, limit: keyof PlanLimits, current: number, now = new Date()): boolean {
  if (isTrialActive(ctx.trialEndsAt, now)) return true;
  return current < getPlan(ctx.planId).limits[limit];
}

export const FEATURE_LABEL: Record<Feature, string> = {
  pos_billing: "POS billing",
  kot_print: "KOT print",
  basic_reports: "Roz ki report",
  excel_export: "Excel download",
  order_alarm: "Naye order ka alarm",
  insights: "Dhandha insights",
  qr_ordering: "QR se customer order",
  kds: "Kitchen display screen",
  inventory: "Inventory / stock",
  recipe_costing: "Recipe costing",
  loyalty: "Loyalty points",
  campaigns: "Campaigns",
  whatsapp: "WhatsApp",
  aggregator_reconciliation: "Zomato/Swiggy P&L",
  multi_outlet: "Multi-outlet",
  api_access: "API access",
};
