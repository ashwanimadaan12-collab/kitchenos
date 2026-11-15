# KitchenOS

Enterprise multi-brand restaurant ERP & POS platform. Monorepo managed with
pnpm workspaces + Turborepo.

## Milestone status

- **Prompt 01 — Project Foundation: done.** Auth (login/refresh/logout, bcrypt
  hashing, JWT access + rotating refresh tokens), RBAC (org-scoped roles and
  permissions), organization membership, Postgres schema foundation, Redis
  connection, API versioning (`/v1`), structured logging (pino), global error
  handling, health checks, and a protected Next.js admin shell.
- **Prompt 02 — Multi-Brand & Multi-Kitchen Management: done.** Brands,
  kitchens (production or central-warehouse), kitchen stations, and outlets,
  with many-to-many brand↔kitchen and outlet↔kitchen mappings (a kitchen can
  be dedicated to one brand or shared across several; an outlet is typically
  fulfilled by its brand's primary kitchen plus the central warehouse).
  Seeded with the three demo brands (Cafe Old Monk, Pizza Paproni, Bounty
  Bakery), 3 kitchens and 4 outlets. Full CRUD + mapping admin screens at
  `/brands`, `/kitchens`, `/outlets`.
- **Prompt 03 — Product / Menu / Pricing: done.** Tax categories, brand-scoped
  product categories, products sold through one or more variants (e.g.
  sizes), named menus assigned to outlets per sales channel (dine-in,
  delivery, takeaway), and outlet-level price overrides on top of a
  variant's base price. Seeded with 2 tax categories, 6 categories, 6
  products (10 variants total), 4 menus, and one outlet price override.
  Full CRUD + mapping admin screens at `/products` (also covers tax/product
  categories) and `/menus`; price overrides live on each outlet's own page.
- **Prompt 04 — Ingredient / Recipe / Packaging Engine: done.** An
  ingredient catalogue (raw materials and packaging — boxes, cups, bags —
  tracked the same way), and recipes: the bill of materials for a product
  variant, with an optional preparation station (tying into Prompt 02's
  kitchen stations, ready for the Prompt 07 KDS) and a yield quantity.
  Seeded with 16 ingredients (11 raw materials, 5 packaging) and 6 recipes
  across all three brands (22 ingredient lines total). Full CRUD + BOM
  admin screens at `/ingredients` and `/recipes`.
- **Prompt 05 — Advanced Costing Engine: done.** Ingredient cost per unit
  with an append-only cost history (so cost changes are auditable and
  margin analysis stays possible historically), per-recipe overhead costs
  (labor, utilities, ...), and an on-demand variant cost breakdown
  (ingredient cost + overhead, divided by yield, compared against the
  selling price — base or an outlet override — for margin amount/percent).
  Missing ingredient cost data is surfaced explicitly rather than silently
  treated as zero. Seeded costs for 15 of 16 ingredients (Eggs left
  uncosted on purpose, to demonstrate that), a price-increase history entry
  for Flour, and 3 recipe overhead costs. Cost management lives on the
  `/ingredients` page; cost breakdown + overheads live on each recipe's
  own page under `/recipes`.
- **Prompt 06 — POS Billing: done.** Point-of-sale orders at an outlet:
  adding items (only ones actually on an active menu assigned to that
  outlet — not just any variant in the catalog), prices and tax rates
  snapshotted at add-time so a later menu/price change never rewrites an
  existing bill, editable quantities, per-line voiding (never hard-deleted,
  for an auditable bill), split/partial payments across cash/card/UPI/
  wallet that close the order once they cover its total, and order voiding
  (only before any payment is taken — a paid order needs a refund flow,
  which is out of scope here). Order numbers are gap-free per outlet via
  an atomic counter. Seeded with one open order (2 items) and one fully
  paid order, at two different outlets. Full billing screen at `/pos`.
- **Prompt 07 — Kitchen Display System: done.** Adding an order item
  automatically routes it to a kitchen ticket at its recipe's preparation
  station (items with no station assigned — e.g. a coffee — simply never
  get a ticket); tickets move forward through QUEUED → IN_PROGRESS →
  READY → SERVED (no going back, and nothing can act on an already
  SERVED or CANCELLED ticket), and voiding the order item behind an
  unserved ticket automatically cancels it. Seeded with one queued ticket
  (the open order's sandwich, at Grill) and one served ticket (the paid
  order's pizza, at Pizza Oven). Board at `/kds` (pick a station) →
  `/kds/[stationId]`.
- **Prompt 08 — Inventory / Procurement ERP: done.** Supplier master data;
  purchase orders against a supplier and a kitchen (reusing Prompt 02's
  `Kitchen`, including its `CENTRAL_WAREHOUSE` kind, as the inventory
  location rather than introducing a separate warehouse concept) through a
  draft → ordered → partially received → received lifecycle, with
  line-item-level partial receiving and a gap-free per-org order number via
  an atomic counter; and a stock ledger (`StockMovement`, append-only) with
  a cached running balance (`StockBalance`) per kitchen/ingredient, plus
  manual wastage/adjustment entries and a reorder point. Selling a POS item
  now deducts its recipe's ingredients from the outlet's primary kitchen
  (and restores them if the line is voided or its quantity reduced); this
  is best-effort and never fails the sale, and stock is deliberately
  allowed to go negative rather than blocking a sale. Seeded with 2
  suppliers and 2 purchase orders (1 received, 1 partially received) with
  resulting stock on hand at the Central Warehouse. Admin screens at
  `/suppliers`, `/purchase-orders` (+ detail page with submit/receive/
  cancel), and `/inventory` (pick a kitchen) → `/inventory/[kitchenId]`.
- **Prompt 09 — Combo / Promotion Intelligence: done.** Combos bundle two
  or more product variants from the same brand at a single bundle price
  (e.g. "Margherita + Garlic Bread Combo"); ordering one on the POS
  expands it into one `OrderItem` per component — reusing the exact same
  per-variant KDS routing and recipe-based inventory consumption as an
  ordinary item — with the bundle price allocated across those lines
  proportionally to each component's own base price (the last line takes
  the rounding remainder so the lines always sum to exactly
  `comboPrice × quantity`). A combo instance is added and voided as one
  atomic unit — its component lines can't be edited or voided
  individually. Promotions are coupon codes (percentage or flat amount,
  optionally brand-scoped, with an optional minimum subtotal, a cap on a
  percentage discount, a date window and a usage limit) a cashier enters
  at the POS; at most one is active per order, and it discounts the
  order's final total rather than rewriting any line or its tax. Seeded
  with 1 combo (Margherita Medium + Garlic Bread, ₹430) on Pizza Paproni's
  dine-in menu, and 2 promotion codes (`WELCOME10`: 10% off org-wide,
  capped at ₹100; `FLAT50`: ₹50 off orders of ₹200+ at Cafe Old Monk
  only). Admin screens at `/combos` (+ detail page for managing
  components) and `/promotions`; both are orderable from the POS screen
  at `/pos/orders/[id]`.
- **Prompt 10 — Business Intelligence / Reporting: done.** Six read-only
  report endpoints computed on demand from existing order/payment/
  promotion data (no new schema, no materialized rollup table) — every
  report is scoped to PAID orders only, with optional date range, outlet,
  brand and channel filters: a sales summary (order count, subtotal, tax,
  discount, total, average order value), revenue by day, top-selling
  products by revenue (combo components attributed individually, the same
  as an ordinary sale), combo performance (instances sold and revenue per
  combo, not per component line), a payment-method breakdown, and
  promotion usage (redemptions and total discount given per code). Admin
  screen at `/reports`, with a filter form that round-trips through the
  URL's query string so a filtered view is linkable/bookmarkable.
- **Prompt 11 — Finance / HR / CRM: done.** Three deliberately minimal
  domains. **Finance**: `Expense` records (rent, utilities, salary,
  marketing, maintenance, other), optionally scoped to one outlet (null =
  organization-wide), feeding the Prompt 10 reports' profit-and-loss
  endpoint (revenue minus expenses). **HR**: `Employee` records and a
  clock-in/clock-out `Attendance` log — no payroll calculation, shift
  scheduling or leave management. **CRM**: `Customer` records with simple
  loyalty accrual (one point per ₹100 of a paid order's total, floored;
  no redemption flow) and per-customer order history. An order can
  optionally link to a customer at creation or any time while still OPEN;
  points are credited only once the order is actually PAID, and removing
  the link before payment means nothing is credited. Seeded with 3
  employees (one with a closed shift, one still clocked in), 3 expenses,
  and 2 customers (one linked to the Prompt 06 seed's paid order, with
  loyalty points already credited to match). Admin screens at `/expenses`,
  `/employees` (+ a detail page for attendance), and `/customers` (+ order
  history); the POS order screen at `/pos/orders/[id]` can link/unlink a
  customer directly.
- **Prompt 12 — SaaS Hardening: done.** The last milestone in the original
  12-prompt spec, closing gaps in the auth/security foundation laid down
  in Prompt 01. Global rate limiting (100 req/60s per IP by default) plus
  a tighter limit on `/auth/login` (10/60s) for brute-force/credential-
  stuffing protection, on top of **account lockout** — a user's own
  account locks for a cooldown (default 15 min) after too many
  consecutive failed login attempts, independent of the IP-based
  throttle. **Session management**: every login's refresh-token family is
  a listable, individually revocable "session" (`GET /v1/auth/sessions`,
  `DELETE /v1/auth/sessions/:id`), so a user can see every device signed
  in and sign one out remotely. **Audit log viewer**: the `audit:view`
  permission has existed since Prompt 01 but had nothing to view —
  `GET /v1/audit-logs` (filterable by entity type/action/user/date) now
  exposes the append-only log `AuditService.log()` has been writing to
  all along, scoped to the caller's own organization. No new business
  domain — this milestone only touches `User` (two new lockout columns)
  and reads tables other milestones already write to. Admin screens at
  `/sessions` and `/audit-logs`; helmet security headers and the refresh-
  token rotation/reuse-detection in `AuthService` already existed before
  this milestone and needed no changes.
- **Prompt 13 — Customer Communication Engine: done.** A unified WhatsApp
  (Meta Cloud API) + SMS (Twilio) communication engine behind one
  provider-abstraction interface, with approved per-channel message
  templates (optionally brand-specific, taking priority over an
  organization-wide default of the same key), consent-aware sending
  (transactional messages are allowed by default; promotional messages
  are skipped — not errored — without a recorded opt-in), scheduling,
  delivery-status webhooks (real HMAC/verify-token signature checks, not
  a stub), retry, and a complete, filterable communication history.
  Order creation automatically sends an order-confirmation message once
  an order with a linked customer reaches PAID (brand, outlet, items,
  total, payment status and loyalty points all rendered into the
  template), and voiding a paid-adjacent order sends a configurable
  status-change notification if a template exists for it. No real
  provider credentials are configured in this environment on purpose —
  every send attempt is still real integration code (a real HTTP call to
  the real provider API), it just fails with a clear "not configured"
  reason instead of actually delivering, exactly as it would in any
  environment missing those secrets. Seeded with 5 templates (an
  org-wide + a Pizza-Paproni-specific order confirmation on WhatsApp, one
  on SMS, an order-voided notice, and a promotional weekend-special) and
  2 customer preference rows (one opted in to WhatsApp marketing with
  consent evidence, one opted out of SMS entirely). Admin screens at
  `/communications` (templates) and `/communications/messages` (history,
  retry, manual dispatch trigger); a preferences/consent/opt-out panel
  lives on each customer's own page.
- **Prompt 14 — Loyalty & Rewards Engine: done.** A centralized,
  multi-brand points program built on an append-only `LoyaltyTransaction`
  ledger — `Customer.loyaltyPoints` (spendable balance) and
  `lifetimePoints` (never reduced by redemption or expiry) are only ever
  written in the same DB transaction as a new ledger row, the same
  ledger-vs-cached-projection pattern as Prompt 08's stock ledger.
  Configurable org-wide earning rate (points per ₹100) and redemption
  ratio (₹ per point), each overridable per brand; membership tiers
  (derived from lifetime points, each with an earning multiplier); a
  welcome bonus on customer creation; a one-time referral bonus to the
  referrer on the referee's first paid order; a birthday bonus; optional
  points expiry; and a manual staff adjustment, positive or negative.
  Redemption debits the balance immediately when applied to an open
  order (a `LoyaltyRedemption` row, the same reservation shape as
  Prompt 09's `PromotionRedemption`) rather than at payment time, so two
  concurrently open orders can never spend the same points; voiding an
  order with an active redemption reverses it. Seeded with program
  settings (20pt welcome bonus, 50pt referral bonus, 25pt birthday
  bonus, 365-day expiry), 3 tiers (Silver/Gold/Platinum), and Vikram
  (from Prompt 11's seed) now has a birthday and is Sneha's referee, with
  his original seeded points reissued as a real ledger `EARN` row instead
  of a direct balance increment. Admin screen at `/loyalty` (program
  settings, tiers, brand rate overrides); a wallet/ledger/manual-
  adjustment panel lives on each customer's own page; the POS order
  screen at `/pos/orders/[id]` can redeem/remove points directly.
- **Prompt 15 — WhatsApp Marketing Automation: done.** A customer-
  segmentation and A/B-testable WhatsApp campaign manager built entirely
  on top of Prompt 13's communications engine and Prompt 14's loyalty
  data, reusing both wholesale rather than rebuilding anything.
  `CustomerSegment`s (everyone, inactive N+ days, repeat customers,
  brand preference, total spend, loyalty tier, birthday this week) are
  resolved on demand against live order/customer/loyalty data, never a
  stored membership list. A `Campaign` targets one segment through one
  or more `CampaignVariant`s (a single 100%-traffic variant is "no A/B
  test", not a separate code path); dispatch deterministically buckets
  each newly-targeted customer into a variant by traffic share and sends
  through `CommunicationsService.sendUsingTemplateId`, so consent/opt-out
  enforcement needed zero new code. An optional budget caps recipients at
  a snapshotted cost-per-message so a later organization-wide rate change
  never rewrites an in-flight campaign's math. Every performance number
  (sent/delivered/failed/skipped/converted/conversion rate/revenue
  attributed, overall and per variant) is computed fresh from
  `CampaignRecipient` + `CommunicationMessage` joins — the same
  computed-not-cached philosophy as the Prompt 10 reports. Revenue
  attribution is last-touch within a per-campaign conversion window, and
  only counts a message that actually reached `SENT`/`DELIVERED` — a
  `SKIPPED` (no consent) or `FAILED` send never triggers a false
  attribution. Scoped to WhatsApp only, matching this milestone's own
  title; every variant's template must be an active WhatsApp promotional
  one. Seeded with 3 segments (Everyone, Inactive 90+ days, Prefers Pizza
  Paproni) and 1 draft campaign (Weekend Combo Blast) reusing Prompt 13's
  `weekend_special` template. Admin screen at `/campaigns` (segments,
  campaign creation with an A/B variant builder, dispatch/cancel) with a
  per-campaign performance dashboard at `/campaigns/[id]`.
- **Prompt 16 — Dynamic Pricing & Retail Product Management: done.** A
  configurable pricing engine layered on top of the existing outlet-override
  mechanism (Prompt 06), built as one general `PricingRule` shape with
  fully optional/nullable match conditions — variant, outlet, channel,
  days-of-week, a time-of-day window (including one that wraps midnight),
  and a validity date range — rather than a special-cased rule type per
  scenario (midnight/weekend/festival/channel-specific/outlet-specific/
  scheduled-discount/demand-based pricing are all the same mechanism). A
  price quote resolves the outlet's base (override or variant basePrice),
  applies the single most-specific matching active rule (ties broken by an
  explicit `priority`, then recency), caps the result at a retail
  commodity's printed MRP (a legal ceiling it may never exceed, though it
  may freely discount below it), and finally raises it to an org-wide
  minimum-contribution floor — `cost / (1 - minimumMarginPercent / 100)` —
  but only when a cost is actually known; it can't protect what it can't
  measure, so the floor is silently skipped rather than blocking the quote.
  `ProductVariant.kind` distinguishes prepared food (costed from its Recipe
  via Prompt 07's `CostingService`) from a pre-packaged retail commodity
  (costed from its own `purchasePrice`/`supplierPrice`/`landedCost` fields
  instead — a product category this codebase had no concept of before).
  Every quote returns the selected rule, the final price, that rule's
  validity window, and a full breakdown — the spec's own requirement, and
  the only way a pricing decision stays explainable after the fact.
  `OrdersService.addItem` now quotes through this engine instead of reading
  `OutletProductPrice` directly, and snapshots the selected rule's id/label
  onto the `OrderItem` row; because a confirmed order item's price has
  always been written once and never re-read from its source, a rule
  edited or deactivated afterwards can never retroactively change an
  already-placed line — the spec's "lock the price at confirmation" and
  "never change confirmed order prices retrospectively" requirements held
  for free, by construction, rather than needing new enforcement code.
  Seeded with 2 retail-commodity products (Packaged Drinking Water,
  Potato Chips) carrying real purchase/supplier/landed cost and a printed
  MRP, and 5 pricing rules (weekend, midnight, outlet, channel, festival)
  — all deliberately scoped to those two new variants only, so this seed
  can never perturb the fixed order totals other prompts' e2e specs assert
  against prepared-food variants. `PricingSettings.minimumMarginPercent`
  is deliberately left at its schema default of 0 (auto-created on first
  read, the same pattern as `LoyaltyProgramSettings`) for the same reason
  — the floor exists and is reachable through its own endpoint, but stays
  inert until an admin actually configures it. Admin screen at `/pricing`
  (minimum-margin setting, an ad hoc quote tool showing the full
  breakdown, and pricing-rule management); each product variant's detail
  page links straight into a pre-filtered rule list for it.
- **Prompt 17 — Demand Intelligence & Sales Heatmaps: done.** A read-only
  demand-analytics layer added straight onto Prompt 10's `ReportsService`
  rather than a new module — weekday distribution, hourly distribution, a
  weekday x hour heatmap, peak/slow-hour detection, a monthly (seasonal)
  trend, and brand-/outlet-/channel-wise demand, all computed on demand
  from PAID orders exactly like every existing report, with product-wise
  demand and average order value reused as-is from the already-shipped
  `topProducts` and `salesSummary`/per-grouping fields rather than
  duplicated. The four reports that need a day-of-week, hour-of-day, or
  month bucket (none of which is a real column) share one bounded-and-
  capped order loader — the same 90-day-default-window-plus-20k-row-cap
  guard `salesByDay` already established, reused rather than
  re-implemented per endpoint. "Peak" and "slow" are chosen only among
  hours that actually had an order; an hour with zero orders is
  unmeasured or closed, not slow. Promotion recommendations flag the
  weekday x hour slots with materially fewer orders than average, but —
  per the spec's explicit "measure incremental contribution rather than
  only additional order count" — size and pick the *kind* of
  recommendation by estimated contribution (revenue minus known
  cost-of-goods, reusing Prompt 07's `CostingService` for prepared food
  and Prompt 16's `landedCost`/`purchasePrice` fields for retail
  commodities) rather than by order count alone: a quiet slot with
  healthy margin gets pointed toward a volume-driving discount, while a
  quiet slot that's already thin-margin gets pointed toward a bundle or
  upsell instead, since discounting it further would erode the little
  contribution it has. An item whose cost can't be determined counts its
  full revenue as contribution rather than blocking the estimate — the
  same "can't protect what it can't measure" stance Prompt 16's margin
  floor takes. Admin screen at `/demand` (filterable by the same
  date/brand/outlet/channel dimensions as `/reports`): an interactive,
  hoverable heatmap grid, weekday/monthly/brand/outlet/channel tables, and
  the contribution-aware recommendation list.
- **Prompt 18 — Inventory Forecasting Engine: done.** A demand-forecasting
  layer added onto Prompt 08's inventory module, computed fresh on every
  read from the existing `StockMovement` ledger — no separate forecast
  table to keep in sync. For each ingredient at a kitchen: a weekday-
  adjusted average daily demand (reusing the weekday-bucketing technique
  from Prompt 17), a trend factor comparing the most recent 28 days
  against the 28 before that (clamped 0.5x-2x so a handful of noisy days
  can't run away with the forecast), and — per the spec's explicit
  "account for promotions" bullet — a coarse, clearly-labeled uplift
  applied when any `Promotion` or `Campaign` is currently running or
  starts within the forecast horizon. The classic reorder-point formula
  (average daily demand x lead time + safety stock, where safety stock is
  z=1.65 x demand std-dev x sqrt(lead time) for a ~95% service level)
  drives stockout-risk (HIGH/MEDIUM/LOW/NONE — "NONE" only when there's no
  recent demand to assess risk from at all, since an idle ingredient isn't
  "safe," it's unmeasured), excess-inventory, and expiry-risk (only for
  ingredients with a `shelfLifeDays` set) flags, plus a suggested reorder
  quantity that tops up to a 30-day supply. Lead time resolves from a
  per-kitchen override, else the ingredient's `preferredSupplier`
  (Prompt 08's `Supplier` gained its own `leadTimeDays`), else an org
  default — and safety stock follows the identical override-wins-over-
  computed chain — the spec's "support manual overrides" requirement
  satisfied by the same pattern as every other override in this codebase
  (`OutletProductPrice`, `PricingRule`, `StockBalance.reorderPoint`
  itself). Every forecast returns a human-readable `explanation` array
  naming its own inputs (the average, the trend verdict, the promotion
  uplift, the resolved lead time and its source, the safety-stock
  formula) rather than a bare number — the spec's "explainable
  recommendations" requirement. Product demand prediction reuses the same
  weekday/trend math against `OrderItem` history instead of
  `StockMovement`. Seeded with supplier lead times, a preferred supplier
  and shelf life on Pizza Dough/Mozzarella/Milk, and 60 days of synthetic
  Pizza Dough consumption history at the Shared Kitchen (real order
  traffic in this seed is far too thin for the weekday/trend math to find
  anything) — kept off every other prompt's price- and stock-sensitive
  e2e assertions by living at a kitchen+ingredient combination nothing
  else touches. Admin screen: a forecast-and-reorder table on each
  kitchen's existing stock page (`/inventory/[kitchenId]`), with a
  horizon selector, per-ingredient explanation disclosure, and inline
  safety-stock/lead-time override fields; suppliers and ingredients
  gained lead-time, preferred-supplier and shelf-life fields in their own
  admin screens.
- **Prompt 19 — Smart Promotion Recommendation Engine: done.** A
  promotion-optimization layer that is almost entirely reuse: slow days
  and time slots already live in Prompt 17's
  `ReportsService.promotionRecommendations`, customer segments in Prompt
  15's `SegmentsService`, campaign history in Prompt 15's
  `CampaignsService.getStats`, and the minimum profitable price in
  Prompt 16's margin-floor formula (now extracted into a shared
  `resolveVariantCost`/`computeMinimumProfitablePrice` utility used by
  pricing, demand analytics, and this prompt alike, rather than
  duplicated a third time). The genuinely new analysis is
  `PromotionRecommendationsService`: ranking products as discount
  candidates by demand *and* margin together (a slow-selling thin-margin
  product never makes the list — discounting it further would erode what
  little contribution it has — and a suggested discount is always shrunk
  to whatever the configured margin floor actually allows, never just
  flagged as unsafe after the fact), ranking combos by fewest instances
  sold, and flagging `INACTIVE`-type segments as the best targeting
  candidates. "Run controlled experiments and compare against control
  groups" extends Prompt 15's own A/B variant mechanism rather than
  building a parallel experiment system: a `CampaignVariant` can be
  marked `isControl`, in which case it's targeted and still eligible for
  conversion attribution but is deliberately never sent a message — the
  counterfactual baseline every other variant's lift (conversion-rate and
  revenue-per-recipient, both just "this variant's numbers minus the
  control's") is measured against. `CampaignsService.getStats` now builds
  its `variants[]` list from every configured variant rather than only
  ones that happened to receive a recipient — a small segment can easily
  leave one side of a 50/50 split (especially a control group) with
  nobody bucketed into it, and the experiment comparison needs both sides
  present even then; this was caught live, not by a unit test with a
  convenient sample size. "Never recommend a discount that violates
  configured margin safeguards without explicit authorized approval" is
  enforced where a discount actually gets created, not just suggested:
  `PricingRulesService.createRule`/`updateRule` reject a single-variant
  discount priced below the org's minimum-margin floor unless the caller
  sets `approvedOverride`, the same override-requires-explicit-confirmation
  shape as every other guarded action in this codebase. Admin screens:
  `/recommendations` (discount/combo/segment candidates, historical
  campaign results, and a minimum-profitable-price lookup) and a Control
  checkbox + per-variant lift column added to the existing `/campaigns`
  create form and detail page.
- **Prompt 20 — Advanced Growth Dashboard: done.** The final milestone:
  a consolidated owner dashboard assembling all 15 figures the spec
  asks for, almost entirely by reusing the services every earlier
  prompt already built rather than introducing new domain logic —
  `GrowthDashboardService` (`apps/api/src/dashboard/`) is mostly
  aggregation glue over `ReportsService` (Prompt 10/17), `LoyaltyService`
  (Prompt 14), `CampaignsService` (Prompt 15), `ForecastingService`
  (Prompt 18) and `PromotionRecommendationsService` (Prompt 19). Three of
  those services weren't exported from their module yet (`ReportsModule`
  exported nothing at all; `PromotionsModule` exported
  `PromotionsService` but not `PromotionRecommendationsService`) — caught
  and fixed by inspection before writing any code that would have failed
  to resolve at Nest's dependency-injection stage. Total contribution,
  brand/outlet profitability and the customer repeat rate are genuinely
  new math: revenue minus COGS (reusing the `resolveVariantCost` utility
  extracted in Prompt 19) for contribution, with brand/outlet
  profitability also netting out `Expense` rows rolled up via each
  outlet's brand — an org-wide expense (`outletId` null) has no single
  brand or outlet to charge it to, so it's excluded from those two
  breakdowns and left where it already belongs, the org-wide P&L
  (`ReportsService.profitLoss`); customer repeat rate reuses the same
  `groupBy`-with-a-`having`-style filter Prompt 15's REPEAT segment
  already resolves customers with. Loyalty point liability is a new
  `LoyaltyService.getPointsLiability` method (every customer's balance x
  the org's default redemption ratio) — brand-specific `BrandLoyaltyRule`
  overrides aren't applied, since a customer's balance isn't tagged to
  the brand it was earned under; documented as an approximation.
  WhatsApp campaign ROI aggregates `CampaignRecipient.attributedRevenue`
  against message cost (`costPerMessage` x messages sent); SMS campaign
  ROI is reported honestly as null with an explanatory note rather than
  fabricated, since Prompt 15's campaign manager only ever accepts
  WhatsApp templates — there has never been an SMS campaign to measure.
  Stockout risk and purchase recommendations loop
  `ForecastingService.forecastAllIngredients` across every kitchen in the
  org (forecasting is inherently kitchen-scoped) when no `kitchenId`
  drill-down is given. Drill-down to brand/outlet/kitchen/channel is one
  shared `GrowthDashboardFilterDto` (extends the existing
  `reportFilterSchema`) threaded into every reused report call; product-
  level drill-down is already satisfied by `topProducts`' own per-variant
  rows. Admin screen: `/growth`, a new "Growth Dashboard" nav item with
  the same filter-form-plus-tables pattern as `/reports`.

## Installable app (PWA) & offline shell

Beyond the 20-prompt pack: the admin frontend is installable as a standalone app on any
device — mobile, tablet, laptop or desktop — via a Web App Manifest (`apps/web/src/app/manifest.ts`,
served at `/manifest.webmanifest`) and icons generated on demand with `next/og`
(`icon.tsx`/`apple-icon.tsx`, no static image files to maintain). Chrome/Edge/Android show an
"Install app" button in the header once the browser's own `beforeinstallprompt` criteria are met
(`install-app-button.tsx`); Safari (iOS/iPadOS/macOS) has no equivalent event — there, installing
is Share → "Add to Home Screen", which no web page can trigger programmatically.

A hand-written service worker (`apps/web/public/sw.js` — no next-pwa/Workbox dependency, to stay
clear of their Next-15/App-Router compatibility gaps) caches the app shell (pages, JS/CSS, fonts)
for fast repeat loads and a real "you're offline" screen (`/offline`) when a navigation's network
request fails. It deliberately never touches `/v1/*` API calls or caches authenticated page HTML —
serving stale revenue/stock/order data offline would be worse than an honest network error, the
same stance the reporting modules take toward data correctness. The auth middleware
(`apps/web/src/middleware.ts`) exempts the manifest, icons, service worker and offline page from
the login redirect, since a browser's install/offline machinery never carries the app's session
cookies the way an in-app navigation does.

### Offline order-taking (POS)

A dedicated **`/pos/offline`** screen now lets a cashier take a cash-only sale with zero network —
its shell is precached by the service worker, and it's deliberately a plain client component with
no server-rendered data (`offline-pos-client.tsx`), so the cached HTML is never a stale snapshot of
business data. It caches one outlet's sellable items (`lib/offline-pos-db.ts`, a small native-
IndexedDB wrapper — no external dependency) into IndexedDB whenever it loads online, builds a cart
against that cached menu while offline, and queues completed sales locally; an `online` event
listener (plus a flush on every mount) replays the queue against the API automatically once
connectivity returns, with a manual "Sync now" and visible per-order status (queued / failed, with
the error) as a backstop.

This is deliberately **narrower** than the full online POS: items and a cash payment only — no
combos, promotions, loyalty redemption, or customer linking, since all of those need live server
state (a promo's current validity, a loyalty balance) that a device that's been offline can't be
trusted to have. Prices shown offline are the variant's base price, an *estimate* — the backend
(`OrdersService.syncOfflineOrder`, `POST /v1/orders/sync-offline`) always resolves the real price
from live pricing rules at sync time, never trusting whatever the offline screen displayed, the
same stance this codebase takes everywhere else money is calculated.

The hard problem offline order-taking has to solve is **idempotency**: a sync can be retried (the
response was lost, the device dropped again mid-call), and a retry must never create a second
order. A client-generated `clientOrderId` (`Order.clientOrderId`, unique per organization) is the
fix — `syncOfflineOrder` looks it up first and resumes/returns the existing order instead of
creating another one, skipping any item that already landed and skipping payment if one is already
recorded. It's built entirely from the existing `create`/`addItem`/`addPayment` methods (same
pricing, tax, KDS ticket creation, inventory consumption, OPEN → PAID transition as the normal
online flow) rather than re-deriving any of that logic. If a sync fails partway through, the
partial order is left OPEN — visible in the POS's normal open-orders list for a cashier to finish
by hand, never silently duplicated or lost.

### Receipt & KOT printing

"Print KOT" / "Print receipt" buttons on the order detail page (`/pos/orders/[id]`) open a
dedicated `/print/receipt/[orderId]` or `/print/kot/[orderId]` page in a new tab, which
auto-triggers the browser's native print dialog (`print/auto-print.tsx`) — whatever printer the
browser/OS has configured (thermal or otherwise) handles the rest. This was a deliberate choice
over raw ESC/POS-over-USB or a LAN print bridge: it needs no driver, no per-printer protocol work,
and no extra background service, and it's what most thermal printers in actual restaurant use are
already set up for (a standard OS print driver), at the cost of not supporting kiosk-mode
print-with-no-dialog-at-all. Both print pages are intentionally outside the `(admin)` route group
(no sidebar/header to print by mistake) but still behind the same auth middleware as every other
page — printing someone else's bill isn't a navigation the manifest/offline exemptions apply to.
The receipt mirrors the order's own totals (subtotal/tax/discount/total/payments); the KOT omits
prices entirely, since the kitchen needs what to make, not what it costs.

### Real-time KDS (WebSockets)

The Kitchen Display station board (`/kds/[stationId]`) updates the moment a ticket is created,
advanced or cancelled — no polling, no manual refresh. `KdsGateway`
(`apps/api/src/kds/kds.gateway.ts`, Socket.IO via `@nestjs/websockets`) is a thin broadcaster:
`KdsService` still owns every ticket mutation and calls `gateway.broadcast(...)` itself right
after each one (`createTicketForOrderItem`, `cancelTicketForOrderItem`, `advanceStatus`) — the
same direct-call style this codebase already uses for its other side effects, rather than adding
an event-bus layer just for this. Tickets are only ever broadcast into
`org:{organizationId}:station:{stationId}` rooms, so one tenant's kitchen traffic can never reach
another's socket.

A socket authenticates once at connection time with the same JWT the REST API already uses,
verified exactly like `JwtAccessStrategy` does for HTTP and gated on the same `KDS_VIEW`
permission `KdsController` requires — a socket without a valid token or that permission in the
given organization is disconnected immediately, never left half-connected. The frontend
(`kds/[stationId]/live-refresh.tsx`) gets that token from a new `/api/ws-token` route that reads
it out of the httpOnly cookie (the only place client JS ever sees the raw token — everywhere else,
`apiFetch` bridges cookie → `Authorization` header entirely server-side) and simply calls
`router.refresh()` on any ticket event, re-running the station board's own Server Component fetch
rather than maintaining a second, client-side copy of ticket state.

One real bug surfaced while building this and is worth naming: a client that emits
`station:join` straight from the socket's `"connect"` event can lose a race against the gateway's
own async auth check (`handleConnection` awaits a JWT verify and a permission lookup) and silently
join no room at all — no error either side, the ticket events just never arrive. The fix is an
explicit `"ready"` event the server emits only once that auth check succeeds; the client waits for
it before ever joining a station. Caught by testing the real flow against a live server, not by a
mock-based unit test, which wouldn't reproduce the timing at all.

### Production deployment

A generic, cloud-agnostic Docker setup — works the same on a bare VPS, an EC2 instance, a
DigitalOcean droplet, or any machine with Docker, since nothing in it is tied to one provider:

- **`apps/api/Dockerfile`** — copies the whole built monorepo into the runtime image rather than
  trying to ship a pruned `node_modules` (e.g. via `pnpm deploy`). This repo's `.gitignore`
  excludes both `dist/` and `packages/database/generated/` (the compiled output and the generated
  Prisma client), and a pruned deploy follows exactly that ignore list — it would silently ship
  without its own compiled code. Copying everything keeps pnpm's `node_modules` symlinks intact
  and guarantees nothing needed at runtime is left behind, at the cost of a larger image than a
  fully-optimized prune would produce.
- **`apps/web/Dockerfile`** — uses Next's `output: "standalone"` (`next.config.ts`), which traces
  exactly the files the server needs, including the transpiled `@kitchenos/ui`/`@kitchenos/shared`
  workspace packages, so this image only needs that trace output copied in, not the whole repo.
  **A real gotcha found by actually building and running this image, not just reading the
  Dockerfile back**: `NEXT_PUBLIC_API_URL` gets inlined into the compiled output at *build* time —
  setting it at `docker run` time has no effect at all, since by then the value is already frozen
  into the bundle. The Dockerfile takes it as a build `ARG` for exactly this reason; it must be the
  final public API URL *before* the image is built, which `docker-compose.prod.yml` wires up via
  `build.args`.
- **`docker-compose.prod.yml`** + **`Caddyfile`** — Postgres, Redis, both app images, and Caddy as
  a reverse proxy that gets TLS certificates automatically from Let's Encrypt once DNS for the web
  and API domains points at the host. Postgres/Redis publish no host ports — only the `api`
  service, on the same Docker network, ever reaches them.
- **`.env.production.example`** — every variable the compose file needs, with `CHANGE ME`
  placeholders for secrets; never commit the filled-in `.env.production` itself.
- **`.github/workflows/ci.yml`** — lint, typecheck, unit tests and the full e2e suite (against real
  ephemeral Postgres/Redis service containers, seeded with the same demo data the e2e specs expect)
  on every push and pull request.

All of this was verified by actually building both images and running them together — `docker
build`, then real containers talking to each other over a Docker network, confirming login and a
protected page load end-to-end through the production build — not left as untested Dockerfiles.
Payment gateway integration and Zomato/Swiggy aggregator integration are deliberately not part of
this pass: the first needs a real (even sandbox) payment-provider account, and the second needs the
partner's actual API documentation and credentials, which this project doesn't have — building
either without them would mean shipping something that looks like an integration but doesn't
actually work, which this codebase's own standing rule against fake third-party integrations rules
out.

### Dine-in tables & QR ordering

`/tables` (admin) lets staff create a dine-in table per outlet; each one gets a `RestaurantTable`
row with its own `qrToken` and a QR code (generated server-side with the `qrcode` package, no
client JS) encoding `/order/{qrToken}`. A customer who scans it lands on that page — no login, not
under the `(admin)` route group, and exempted from the auth-redirect middleware — sees the outlet's
real menu and prices, builds a cart, and submits it straight into the normal order/KDS pipeline as
a cash-at-counter sale (no payment integration needed for this to work end-to-end).

`qrToken` is this whole feature's authorization model: there's no organization header, no session,
nothing else identifying the request — the token alone resolves to exactly one table, one outlet,
one organization, the same trust boundary a printed QR code already has in the physical world
(whoever can scan it can order for it). `TablesService.placeOrder` is built entirely from the
existing `OrdersService.create`/`addItem` (so pricing/tax/KDS ticket creation/inventory consumption
all behave identically to a staff-entered order), and is itself idempotent in spirit with the rest
of the order-creation paths: scanning the same table's QR again adds to its already-open order
instead of starting a second one, so a table doesn't end up with two concurrent bills. Orders placed
this way simply have no `createdByUserId` — made nullable on `Order` for exactly this case, the only
schema change the feature needed beyond the new `RestaurantTable` model and `Order.tableId`.

The admin `/tables` list doubles as an occupancy view (`openOrder` on each table) without a
separate endpoint, and the public menu/order endpoints carry their own tighter rate limit than the
global default, since there's no logged-in user's own throttle backing them up the way there is
everywhere else in the API.

### Self-service signup (multi-tenant SaaS)

`/signup` lets a brand-new restaurant create its own organization and start using KitchenOS
immediately — no manual provisioning per customer. `POST /v1/auth/signup`
(`AuthService.signup`) creates an **empty** organization (no demo brands/outlets/menu — this
person builds all of that through the normal admin screens afterwards), a one-person "Org Admin"
role granted every permission except `platform:manage` (that one is reserved for KitchenOS's own
platform operators, never a customer), and logs them straight in. The granted permission set is
read live from the `Permission` table rather than a hardcoded list, so it can never drift out of
sync with the demo seed's own `ORG_ADMIN_PERMISSIONS` as new features add permissions.

This is also why the permission catalogue itself (`packages/database/prisma/permissions-catalogue.ts`)
is its own shared file now, imported by both `seed.ts` (the demo seed — organization, brands,
products, the works, for this repo's own development/demo use) and the new
**`seed-production.ts`** (`pnpm db:seed:production`): a real deployment runs only the latter, once,
before its first signup — it seeds nothing but the permission catalogue, deliberately creating no
organization and no demo data, since a paying customer should never see KitchenOS's own fake
restaurant. `docker-compose.prod.yml`'s own setup instructions call this out explicitly, since
running the demo seed against a real deployment by habit would be an easy and very wrong mistake.

## Structure

```
apps/
  api/        NestJS backend (apps/api)
  web/        Next.js 15 admin frontend
packages/
  database/   Prisma schema + generated client (@kitchenos/database)
  shared/     Cross-app types, zod schemas, RBAC permission keys
  ui/         Shared React components
  config/     Shared tsconfig/eslint bases
```

## Prerequisites

- Node.js >= 20, pnpm 10 (`corepack enable` recommended)
- Docker (for local Postgres + Redis)

## Setup

```bash
cp .env.example .env
# Generate real secrets and paste them into .env:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

pnpm install
docker compose up -d        # starts Postgres on :5432 and Redis on :6379

pnpm db:generate             # generate the Prisma client
pnpm db:migrate              # create and apply the initial migration
pnpm db:seed                 # seeds a demo org + admin user + brands/kitchens/outlets/products/menus/recipes/costs/orders/kds/suppliers/purchase-orders/stock/combos/promotions/expenses/employees/customers/communication-templates/preferences/loyalty-program/tiers
```

Seeded login: `admin@demo-restaurants.test` / `ChangeMe123!`

## Running

```bash
pnpm --filter @kitchenos/api dev     # http://localhost:4000 (health: /health)
pnpm --filter @kitchenos/web dev     # http://localhost:3000
```

Or both via Turborepo: `pnpm dev`.

## Environment variables

See `.env.example`. All are validated at API boot by
`apps/api/src/config/env.schema.ts` (zod) — the process fails fast with a
clear message if any are missing or malformed.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api, database | Postgres connection string |
| `REDIS_URL` | api | Redis connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | api | HMAC secrets for signing JWTs (min 32 chars) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | api | Token lifetimes, e.g. `15m`, `30d` |
| `API_PORT` / `API_URL` | api | Where the API listens / is reachable |
| `CORS_ORIGIN` | api | Allowed origin for browser requests (the web app) |
| `NEXT_PUBLIC_API_URL` | web | API base URL the Next.js server calls |
| `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_MAX` | api | Global rate limit window/ceiling, per IP |
| `LOGIN_LOCKOUT_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | api | Consecutive failed logins before an account locks, and for how long |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_GRAPH_API_VERSION` | api | WhatsApp Cloud API credentials for sending; all optional — unset means that channel's sends fail with a clear "not configured" reason instead of crashing |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | api | Verifies the WhatsApp delivery-status webhook's signature / subscription handshake; optional, and the webhook rejects every request until both are set |
| `SMS_TWILIO_ACCOUNT_SID` / `SMS_TWILIO_AUTH_TOKEN` / `SMS_TWILIO_FROM_NUMBER` | api | Twilio SMS credentials for sending and for verifying the delivery-status webhook's signature; all optional, same soft-fail contract as WhatsApp |

## Testing

```bash
pnpm --filter @kitchenos/api test        # unit tests
pnpm --filter @kitchenos/api test:e2e    # e2e (needs Postgres + Redis running)
pnpm lint
pnpm typecheck
```

## Architecture notes

- **Tenant isolation**: every org-scoped row carries `organizationId`;
  `OrganizationMembership` is unique per `(organizationId, userId)`, and
  permissions are resolved per-request from the membership active in the
  `X-Organization-Id` header — never baked into the JWT, so a role change
  takes effect immediately without reissuing tokens.
- **Auth**: access tokens are short-lived JWTs; refresh tokens are opaque,
  stored server-side only as a SHA-256 hash, and rotate on every use
  (`AuthService.refresh`). Reusing an already-rotated refresh token revokes
  its entire token family — a sign of token theft.
- **RBAC**: permissions are a flat catalogue (`permissions` table) attached
  to org-scoped `roles` via `role_permissions`; `@RequirePermissions(...)` +
  `PermissionsGuard` enforce them per route.
- **Web auth storage**: the Next.js app never touches tokens in client-side
  JS. Route handlers under `src/app/api/auth/*` proxy to the API and store
  tokens in httpOnly cookies; Server Components read the session via
  `src/lib/session.ts`. On login, the active-organization cookie defaults to
  the user's first membership so org-scoped pages work immediately, without
  waiting for a manual selection in the header.
- **Catalog mutations from the browser**: `src/app/api/catalog/[...path]`
  is a thin authenticated proxy — client components `fetch` it directly
  (e.g. `POST /api/catalog/brands`), it forwards to the NestJS API with the
  caller's own access token and active-org header from httpOnly cookies, and
  returns the response as-is. The browser never sees the token; the backend's
  own RBAC still governs what each call can do.
- **Catalog tenant isolation**: `Brand`, `Kitchen`, `Outlet`, `TaxCategory`,
  `ProductCategory`, `Product`, and `Menu` all carry `organizationId`
  directly; every service method filters reads by it and re-validates it
  before creating a mapping (e.g. mapping a brand to a kitchen, or a variant
  to a menu, checks both sides belong to the caller's org), so a resource
  from another tenant 404s instead of leaking — covered by
  `catalog.e2e-spec.ts` and `menu.e2e-spec.ts`.
- **Pricing**: a `ProductVariant.basePrice` is the brand-wide default;
  `OutletProductPrice` is an optional per-outlet override on top of it (e.g.
  a premium airport outlet). Money fields are Postgres `NUMERIC` via Prisma
  `Decimal` end-to-end — API input is validated as a decimal string and
  passed straight through, never parsed as a JS float.
- **Ingredients & recipes**: `Ingredient.kind` (`RAW_MATERIAL` | `PACKAGING`)
  lets packaging items share the same catalogue and the same
  `RecipeIngredient` lines as food ingredients, since both are just entries
  on a variant's bill of materials. A `Recipe` is unique per variant and its
  optional `preparationStationId` must resolve to a `KitchenStation` in the
  caller's own organization — validated via a join through `Kitchen`, since
  `KitchenStation` has no `organizationId` column of its own. Covered by
  `recipe.e2e-spec.ts`, including the cross-tenant station/ingredient checks.
- **Costing**: `Ingredient.costPerUnit` is the current cost; setting a new
  one (`CostingService.setIngredientCost`) always logs a new
  `IngredientCostHistory` row in the same transaction rather than
  overwriting the old value — cost changes are a historical record, not a
  single mutable field. A variant's cost is never stored: it's computed
  on demand from its recipe's ingredient lines (quantity × ingredient
  cost) plus `RecipeOverheadCost` rows, using Prisma's `Decimal` for exact
  arithmetic throughout (never a JS float), and flags any ingredient with
  no cost set rather than silently costing it as zero. Covered by
  `costing.e2e-spec.ts`, including outlet-price-override selection and the
  cross-tenant checks for ingredients, recipes, variants and outlets.
- **POS billing**: an `Order`'s `subtotal`/`taxTotal`/`total` are stored and
  recalculated on every item change rather than computed on read, since
  they're needed immediately for the "has this order been paid off" check.
  `OrderItem` snapshots `productName`/`variantName`/`unitPrice`/
  `taxRatePercent` at the moment it's added (from the outlet's own price —
  override or base — and the product's tax category), so a bill never
  changes retroactively when the menu does. `OutletOrderSequence` hands out
  gap-free per-outlet order numbers atomically in the same transaction as
  order creation. An item can only be added if it resolves through a real
  `OutletMenu → Menu → MenuItem` chain for that outlet — tenancy alone
  isn't the check; the item has to actually be sellable there. Covered by
  `orders.e2e-spec.ts`, including that business rule and the cross-tenant
  checks for outlets, variants and orders.
- **Kitchen display**: `KitchenTicketItem` is a thin routing/status layer
  on top of `OrderItem`, created by `OrdersService.addItem` (via
  `KdsService.createTicketForOrderItem`, imported into `OrdersModule`
  rather than the other way around, so KDS has no dependency on orders)
  only when the variant's recipe has a `preparationStationId` — an item
  with no prep step just never shows up on any kitchen display. Status
  transitions are forward-only (`STATUS_RANK` in `KdsService`), and
  voiding the order item behind a ticket cancels it rather than leaving
  it stranded. Covered by `kds.e2e-spec.ts`, including the backward/
  terminal-state rejections and the cross-tenant checks for stations and
  tickets.
- **Inventory ledger vs. projection**: `StockMovement` is the append-only
  source of truth (a signed `quantityDelta` per kitchen/ingredient, with a
  `referenceType`/`referenceId` back to whatever caused it — a
  `PurchaseOrderItem` receipt, an `OrderItem` consumption, or a manual
  adjustment); `StockBalance` is a derived running total kept in sync in
  the same Prisma transaction as the movement insert
  (`InventoryService.applyMovement`), the same ledger-vs-cached-value
  pattern as `IngredientCostHistory` vs. `Ingredient.costPerUnit` in
  Prompt 05. Purchase order numbers reuse Prompt 06's atomic-counter
  pattern (`OrgPurchaseOrderSequence` alongside `OutletOrderSequence`).
- **Supplier relationship deliberately `Restrict`, not `Cascade`**:
  `PurchaseOrder.supplierId` is `onDelete: Restrict` so a live supplier can
  never vanish out from under its purchase history, while
  `PurchaseOrder.organizationId` is `Cascade` for tenant cleanup. Mixing
  the two on the same row is a real gotcha for test fixtures: deleting a
  throwaway `Organization` that still has a `PurchaseOrder` pointing at a
  `Supplier` can silently roll back the whole cascade if the dependent
  `PurchaseOrder` isn't deleted first — `inventory.e2e-spec.ts`'s
  `afterAll` deletes its cross-tenant purchase order explicitly before the
  organization, with a comment explaining why.
- **POS → inventory wiring**: `InventoryModule` is imported into
  `OrdersModule` (same one-way dependency direction as KDS in Prompt 07)
  so `OrdersService.addItem`/`updateItemQuantity`/`removeItem` call
  `InventoryService.consumeForOrderItem`/`reverseForOrderItem` directly.
  Both are wrapped in try/catch and log via `Logger` rather than throwing
  — a sale must never fail because of inventory bookkeeping, mirroring
  `AuditService.log()`. One consequence worth knowing: because this makes
  selling a real POS item a real stock movement, running the full e2e
  suite repeatedly will have `orders.e2e-spec.ts`/`kds.e2e-spec.ts`'s paid
  (not voided) test sales permanently consume a little stock at Old Monk
  Kitchen each run, the same way a real sale would — `inventory.e2e-spec.ts`
  reverts its own scaffolding stock top-ups, but it doesn't reach into
  other milestones' test suites to reverse theirs.
- **Combos expand into real order items, not a new line type**: a
  `Combo`/`ComboItem` pair is just a bill of materials over existing
  `ProductVariant` rows (mirroring `Recipe`/`RecipeIngredient`); adding
  one to an order creates one `OrderItem` per component, tagged with a
  shared `comboInstanceId` (a correlation id, not a foreign key) plus a
  `comboId` back-reference. That reuse is deliberate: Prompt 07's KDS
  ticket routing and Prompt 08's recipe-based inventory consumption both
  operate per `OrderItem`/variant already, so a combo gets correct
  per-component kitchen routing and stock deduction for free, with no
  changes to either module. `OrdersService.addComboItem` allocates the
  bundle price across components proportionally to each one's own
  `basePrice`, rounding every line but the last to 2dp and giving the
  last line whatever remains — so the lines always sum to exactly
  `comboPrice × quantity` regardless of rounding, the same
  last-line-takes-the-remainder technique used nowhere else in this
  codebase but common for splitting a bundle price. Editing or voiding a
  single component line is refused (409): the whole instance is voided
  together via `removeComboItem`, which reverses every line's inventory
  consumption and cancels every line's KDS ticket.
- **Promotions discount the final total, not any line**: `Promotion` is a
  coupon-code catalogue (percentage or flat, optionally brand-scoped, with
  an optional minimum subtotal, a cap on a percentage discount, a date
  window and a usage limit); `PromotionRedemption` is the append-only
  record `PromotionsService` counts against `usageLimit` — not
  `Order.promotionId` — specifically so removing a wrongly-applied code
  from an order (`OrdersService.removePromotion`) can cleanly un-count it
  without any risk of double-counting. `PromotionRedemption.orderId` is
  `@unique`, which is what actually enforces "at most one promotion per
  order," not application logic. `Order.discountAmount` is snapshotted
  once at apply-time (like an `OrderItem`'s price snapshot) and then only
  ever clamped — never recomputed from the original percentage — against
  the order's current `subtotal + taxTotal` on every totals recalculation,
  so a flat discount that would otherwise exceed a bill shrunk by later
  voids can never push `total` negative.
- **Reporting is computed, not stored**: every `/reports/*` endpoint is a
  Prisma `aggregate`/`groupBy` query straight over `Order`/`OrderItem`/
  `Payment`/`PromotionRedemption` — there's no new table and nothing to
  keep in sync, which is only possible because those tables are already
  fully normalized and audit-safe from their own milestones. Revenue-by-
  day groups in application code rather than a date-truncating SQL
  expression, deliberately avoiding hand-built raw SQL for a simple
  grouping; that's fine at this data volume — a high-traffic deployment
  would eventually want a scheduled rollup table, a scaling concern to
  revisit later, not a correctness gap today. Combo performance groups
  `OrderItem` by `[comboId, comboInstanceId]` first — collapsing each
  instance's component lines into one row before counting rows —
  specifically so "how many combos sold" counts instances, not the 2+
  component lines each instance actually has.
- **Loyalty accrual is best-effort, like inventory and KDS**:
  `CustomersService.accrueLoyaltyPoints` wraps its update in try/catch and
  logs via `Logger` rather than throwing — a sale must never fail because
  of loyalty bookkeeping, the same principle as `AuditService.log()` and
  Prompt 08's inventory consumption hooks. It's called from
  `OrdersService.addPayment` only at the moment an order's status actually
  flips to PAID (not on every partial payment), and only once per order:
  unlinking a customer before that moment means nothing is ever credited,
  since nothing reads `Order.customerId` until that one check. `Expense`
  and `Employee` both carry an optional `outletId` (null = organization-
  wide, e.g. head office rent or an area manager) rather than forcing
  every row into exactly one outlet.
- **Account lockout is independent of the rate limiter**: `@nestjs/
  throttler`'s global `ThrottlerGuard` (100 req/60s per IP) plus a
  tighter `@Throttle` override on `/auth/login` (10/60s) stop a client
  from hammering the endpoint at all; `User.failedLoginAttempts`/
  `lockedUntil` stop one specific account from being guessed even from
  many different IPs. `AuthService.validateCredentials` checks
  `lockedUntil` before even hashing the submitted password (cheap check
  first), and a correct password only resets the counters — it doesn't
  bypass an active lock, so the cooldown can't be raced.
- **A "session" is a refresh-token family, not a token**: Prompt 01's
  rotate-on-refresh design means a token's own id changes on every
  refresh, so `AuthService.listSessions` groups by `family` (dedup to the
  latest token per family) to show one row per logged-in device, and
  `revokeSession` revokes every token in that family — not just the one
  row — so the device is actually signed out, not just due for one more
  silent refresh. There's no family claim on the access token itself, so
  the session list can't mark which row is the caller's own session, only
  list all of them as peers.
- **The audit log viewer adds no new data**: `AuditService.log()` has
  written to `AuditLog` since Prompt 01, and the `audit:view` permission
  existed from the same migration — nothing in any later milestone ever
  built a way to read it back. `AuditService.list` is a straight,
  organization-scoped `findMany`; login/logout entries are written with
  `organizationId: undefined` (no org is selected yet at that point in
  the request) and so are deliberately invisible here, a platform-wide
  view being a separate, not-yet-built concern.
- **Communications: a real provider abstraction, deliberately unconfigured
  in this environment**: `CommunicationProviderAdapter` is implemented
  twice — `WhatsAppCloudProvider` (Meta Graph API, template messages
  only, since WhatsApp Business Platform refuses free-form sends) and
  `SmsTwilioProvider` (Twilio's REST API, free-form body) — both real
  HTTP integrations, not stubs. Every env credential is optional by
  design: a missing one makes that adapter throw a
  `CommunicationProviderError` *before* attempting the call, which
  `CommunicationsService.dispatch` catches and records as a `FAILED`
  `CommunicationMessage` with a clear reason — the same "never fail the
  caller's flow" contract as `AuditService.log()` and Prompt 08's
  inventory hooks, just surfaced as a retryable row instead of silently
  swallowed. Consent is enforced the same way: a `PROMOTIONAL` send
  without a recorded `marketingOptIn` becomes a `SKIPPED` row (not an
  exception) that never reaches the provider at all.
- **Templates: brand override beats org-wide, enforced partly in the DB
  and partly in the service**: `CommunicationTemplate`'s unique index is
  `(organizationId, brandId, channel, key)`, which lets a brand-specific
  row and the organization-wide default (`brandId: null`) coexist for
  the same key/channel — but Postgres treats two `NULL`s as distinct, so
  the DB index alone can't stop two org-wide duplicates for the same
  key. `CommunicationsService.createTemplate` guards that case explicitly
  with a `findFirst` before insert, the same "can't portably express
  'unique while NULL' in Prisma's schema syntax" pattern already used for
  Prompt 11's "at most one open attendance clock-in" rule.
  `findActiveTemplateOnAnyChannel` always checks the brand-specific row
  first and falls back to the org-wide one, trying WhatsApp before SMS.
- **Order-confirmation hook, not a literal "on create" send**: the spec
  calls for a confirmation after "successful order creation" including
  the order's items, total, payment status and loyalty points — none of
  which exist yet at the literal `POST /orders` moment in this POS flow
  (an order starts empty; items and payment come later). The hook fires
  from `OrdersService.addPayment`, and only for the request that actually
  wins the atomic OPEN→PAID claim (the same `updateMany` + `count`
  pattern that prevents double-crediting loyalty points), so a
  double-submitted payment can't send two confirmations either. Voiding
  sends a second, independently-templated notification
  (`order_status_update`) if and only if an active template exists for
  that key — "configurable order status notifications" means the
  template's presence is the switch, not a separate settings flag.
- **No durable job queue for scheduling — a documented scope boundary**:
  `scheduledFor` messages are picked up by a 30-second `setInterval` in
  `CommunicationsService.onModuleInit` (skipped under Jest, so tests
  don't leak an open handle) plus a manually-triggered
  `POST /communications/messages/dispatch-due` endpoint used by both the
  e2e tests and the admin UI's "Dispatch due messages now" button. A
  production deployment would swap this for a durable queue (e.g.
  BullMQ, already reachable via the existing Redis connection) — an
  infra choice independent of the communication domain logic itself, out
  of scope for this milestone.
- **Delivery tracking is a real, signature-verified webhook, not a TODO**:
  `CommunicationWebhooksController` verifies Meta's `X-Hub-Signature-256`
  (HMAC-SHA256 over the raw body, keyed by `WHATSAPP_APP_SECRET`) and
  Twilio's `X-Twilio-Signature` (HMAC-SHA1 per Twilio's own request-
  validation spec) before trusting any delivery-status callback;
  `main.ts` enables Nest's `rawBody` option specifically so the exact
  bytes Meta/Twilio signed are available, since re-serializing the
  parsed JSON body would not reproduce the same signature. Unconfigured
  secrets mean every webhook call is rejected (401) rather than silently
  trusted — the same soft-fail-to-safe-default used everywhere else in
  this module.
- **Loyalty is a ledger, not a mutable counter**: `LoyaltyTransaction` is
  append-only — `LoyaltyService` never issues a bare
  `customer.update({ data: { loyaltyPoints: ... } })` outside the same
  `$transaction` as a new ledger row, so `Customer.loyaltyPoints` can
  always be reconstructed by summing its transactions. The one
  after-the-fact mutation anywhere in the module is `expiredAt` on an
  `EARN` row, set by the expiry sweep purely to mark that row's points as
  already consumed — it never changes `points` or `balanceAfter`, so the
  ledger's amounts stay immutable even though this one bookkeeping flag
  does not.
- **Redemption debits eagerly; earning credits at payment**: applying
  points to an order (`OrdersService.redeemLoyaltyPoints`) calls
  `LoyaltyService.redeemPoints`, which debits the balance and writes a
  `LoyaltyRedemption` row immediately — the same "reservation" shape as
  Prompt 09's `PromotionRedemption` — specifically so two concurrently
  open orders can never redeem the same points twice. Earning, by
  contrast, only happens once `addPayment`'s atomic OPEN→PAID claim
  actually wins (the same `updateMany` + `count` guard that also
  prevents double-crediting and double-notifying), since the order's
  final total — and therefore the points it's worth — isn't settled
  until then. Voiding an order with an active redemption calls
  `reverseRedemption` (best-effort, like the inventory/KDS reversal
  already there) before marking it `VOIDED`.
- **Tier is derived, not stored**: a customer has no `tierId` column —
  `LoyaltyService` computes the current tier on every read as the
  highest `LoyaltyTier.minLifetimePoints` the customer's `lifetimePoints`
  has crossed. `earnPoints` reads that tier (from lifetime points
  *before* the order being earned on) to apply its `earningMultiplier`,
  so a tier is earned by what came before, not inflated by the very
  order that might cross its own threshold.
- **Welcome and referral bonuses are one-time by construction, not by a
  check-then-act guard**: the welcome bonus fires once per customer
  simply because `CustomersService.create` calls it exactly once, right
  after the row is created. The referral bonus is less trivial — any of
  a referee's orders could be the one that triggers it — so it's guarded
  by `Customer.referralBonusGrantedAt` starting `null` and being claimed
  with a conditional `updateMany` (count === 0 means already claimed or
  lost a race), the same atomic-conditional-update technique used
  throughout this codebase to close TOCTOU races without a `$transaction`
  wrapper.
- **Birthday/expiry sweeps reuse the Prompt 13 "real interval timer"
  pattern**: `LoyaltyService.onModuleInit` runs both sweeps on a 60s
  `setInterval` (skipped under Jest), the same documented scope boundary
  as `CommunicationsService`'s scheduled-dispatch loop — a production
  deployment would swap this for a durable cron, an infra choice
  independent of the domain logic. Birthday matching is done in
  application code (no portable "month/day of a date column" SQL filter)
  since it's cheap at this data volume; the expiry sweep nets a
  customer's multiple past-due `EARN` rows into one `EXPIRE` transaction
  capped at their *current* balance, since a redemption may already have
  spent some or all of those specific points.
- **No post-payment refund flow exists, so "refund-related points
  reversal" is scoped to what actually can happen**: `OrdersService.
  voidOrder` only ever runs on an `OPEN` order with zero payments (Prompt
  06's standing rule — a paid order needs a refund flow, explicitly out
  of scope project-wide); the only loyalty state a void can possibly
  need to undo is a redemption applied before payment, which is exactly
  what `reverseRedemption` does. There is deliberately no "reverse
  points earned on a refunded paid order" path, since paid orders can't
  be refunded anywhere in this codebase yet.
- **Campaign dispatch is consent-gated for free, not by re-implementing
  consent checks**: `CampaignsService.dispatchCampaign` sends through
  the exact same `CommunicationsService.sendUsingTemplateId` →
  `queueMessage` path every other promotional send uses, so a customer
  without `marketingOptIn` on WhatsApp is `SKIPPED` automatically — the
  milestone's "unsubscribe management" and "consent-aware delivery"
  requirements needed zero new code, only reuse.
- **Conversion attribution only counts messages the customer actually
  received**: `recordConversionIfAny`'s candidate query filters to
  `message.status IN (SENT, DELIVERED)`, deliberately excluding
  `SKIPPED` (never sent — no consent or budget exhausted) and `FAILED`
  (attempted but not delivered) `CampaignRecipient` rows. Counting either
  of those as "reached the customer" would let an order a customer was
  going to place anyway get misattributed to a campaign that never
  actually touched them.
- **Every `Campaign` requires at least one `CampaignVariant`, even with
  no A/B test**: rather than a `templateId` directly on `Campaign` plus a
  separate single-template code path, a lone variant at 100% traffic
  models "no experiment" — one dispatch loop, one stats-aggregation path,
  no special case for the common case.
- **Segment resolution and campaign budget are both "fine at this data
  volume, would need chunking at real scale" tradeoffs, the same
  documented boundary as elsewhere in this codebase**: `resolveCustomerIds`
  computes every segment type by querying/grouping the full matching
  order or customer set in one call (no portable incremental-membership
  index), and `dispatchCampaign` resolves and sends to an entire segment
  synchronously in one request rather than chunking across sweep ticks —
  both are the same "small restaurant chain, not a mass-market B2C app"
  scale assumption made throughout this project.
- **The dynamic pricing engine generalizes seven spec bullets into one
  rule shape instead of seven rule types**: midnight pricing, weekend
  pricing, festival pricing, channel-specific pricing, outlet-specific
  pricing, scheduled discounts, and demand-based promotions are all, at
  bottom, "an adjustment that applies when some combination of
  variant/outlet/channel/day/time/date-range matches." `PricingRule`
  models exactly that, with every match condition optional, and
  `category` carries only a display label — matching logic never branches
  on it. Adding an eighth kind of time-or-scope-bound pricing rule in a
  future prompt needs a new `PricingRuleCategory` enum value, not a new
  code path.
- **An MRP ceiling and a minimum-margin floor are reconciled by priority,
  not by throwing**: `PricingRulesService.quote` always applies the
  printed-MRP cap (a legal constraint) before considering the margin
  floor, and caps the floor itself at the MRP when both are in play — so
  a true conflict (a configured margin that would require pricing above
  MRP) silently resolves in the legal constraint's favor, visible in the
  breakdown (`mrpCapped`/`marginFloorApplied`) rather than failing the
  quote outright. A price quote is a read, and a read should never throw
  over a configuration tension an admin can see and fix separately.
- **A retail commodity's cost and a prepared item's cost are two
  genuinely different data sources, not two code paths reading the same
  field**: `ProductVariant.kind` switches `resolveCost` between the new
  `landedCost`/`purchasePrice` fields and a call into Prompt 07's
  `CostingService.computeVariantCost` — reusing that service wholesale
  for prepared food rather than duplicating recipe-costing logic, and
  returning `null` (never throwing) when a prepared item has no recipe
  costed yet, so the margin floor just has nothing to enforce yet instead
  of blocking every quote for an uncosted item.
- **Decimal values computed by arithmetic (not read straight from a
  column) serialize without padded trailing zeros** — `new
  Prisma.Decimal("50.00").toDecimalPlaces(2).toString()` is `"50"`, not
  `"50.00"` — the same behavior every other computed money field in this
  codebase already has (e.g. `expenses.amount` returns `"2750"` for
  ₹2750.00). The pricing engine's quote response follows that existing
  convention rather than special-casing itself to pad money strings that
  nothing else in the API pads.
- **Demand analytics extends `ReportsService` instead of starting a new
  module**: every new report in Prompt 17 is "more of the same kind of
  thing" `ReportsService` already does — computed on demand from
  Order/OrderItem, scoped by the same `ReportFilterDto` and
  `buildOrderWhere` every existing report uses. A separate
  `DemandAnalyticsModule` would have duplicated that filter-scoping logic
  for no benefit; reusing the module keeps one place responsible for "how
  a report is scoped to this organization's PAID orders."
- **A promotion recommendation's contribution estimate is a documented
  proxy, not a full margin computation**: it nets each order's total
  against the per-unit cost of every PREPARED_FOOD or RETAIL_COMMODITY
  line item it can price, batched into one cost lookup per distinct
  variant rather than one query per order — but it does not account for
  tax, payment processing cost, or labor, and an item with genuinely no
  cost data (no recipe costed yet, no purchase price set) counts as pure
  profit for this estimate rather than skipping the order. That's a
  deliberate, stated scope boundary (match the spirit of "measure
  contribution, not just order count" without building a full P&L
  attribution engine here) — Prompt 19's promotion-optimization engine is
  where a sharper, experiment-driven contribution model belongs.
- **The forecasting engine's "promotions" signal is deliberately org-wide
  and boolean, not per-product**: Prompt 15's campaigns target customer
  segments, not specific products, and Prompt 09's promotion codes aren't
  product-scoped either — there's no clean existing link from "this
  ingredient" to "a specific promotion that moves its demand." Rather than
  build a speculative product-to-promotion attribution model this
  codebase has no data to support, a running or soon-to-start
  promotion/campaign anywhere in the org applies one flat, clearly-labeled
  uplift to every forecast. `promotionUpliftApplied` is always visible in
  the response and the explanation, so this approximation is never silent.
- **A kitchen+ingredient's lead time and safety stock each resolve through
  an explicit three-level chain (override -> computed/resolved ->
  org default), never a silent blend of the two**: `leadTimeSource` and
  `safetyStockSource` are returned alongside the numbers precisely so nothing
  about which one won has to be inferred from the value alone — the same
  transparency `PricingRule`'s `selectedRule` and breakdown already provide.
- **`StockoutRisk` has four levels, not three, because "no recent demand"
  and "healthy stock" are different claims**: an ingredient nobody has
  consumed in 84 days reports `NONE`, not `LOW` — `LOW` is reserved for an
  ingredient that *does* have a measured demand rate and comfortably
  outlasts its lead time. Collapsing those into one "not at risk" bucket
  would hide the difference between "this is fine" and "this has no
  signal to be fine from."
- **The Pizza Dough demand history is directly-seeded synthetic ledger
  data, not generated by replaying fake orders**: 60 days of real order
  traffic would mean seeding thousands of orders just to produce 60
  `StockMovement` rows — the ledger rows are the only thing the
  forecasting engine actually reads, so this seed writes them directly,
  the same "synthetic historical data for a believable demo" tradeoff as
  Prompt 14/15's backdated loyalty ledger rows.
- **A controlled experiment extends `CampaignVariant` instead of
  introducing a parallel experiment model**: a control group is, at
  bottom, just another bucket of the same traffic-split mechanism Prompt
  15 already built for A/B variants — the only genuinely new behavior is
  "don't send this one a message" and "still track whether it converted
  anyway." Modeling it as `CampaignVariant.isControl` (nullable
  `templateId`) means every existing piece — traffic-percent bucketing,
  budget accounting, `CampaignRecipient`, `getStats`'s per-variant
  aggregation — works for a control group completely unchanged; a
  separate `Experiment` entity would have duplicated most of that for no
  benefit.
- **A control-group recipient is a deliberate design choice, not an error
  path, and the schema and the code both say so**: `skippedReason` on a
  budget-exhausted or failed-send recipient and on a control-group
  recipient look similar (both end up "skipped" in the aggregate stats),
  but they mean opposite things — one is a failure to reach the
  customer, the other is the customer never being contacted *on
  purpose*. The skip reason text ("Control group — no message sent by
  design") and `recordConversionIfAny`'s widened candidate query (a
  control recipient has no delivered message but must still count as a
  valid conversion trigger) both exist specifically to keep that
  distinction visible instead of collapsing it into one generic
  "skipped" bucket.
- **The margin safeguard is enforced once, at the one place a discount
  can actually take effect, not re-implemented at every call site that
  might suggest one**: `PromotionRecommendationsService.discountCandidates`
  only ever *suggests* a discount percent (already shrunk to the floor),
  and the real enforcement lives entirely in
  `PricingRulesService.createRule`/`updateRule` — the only path that can
  actually turn a suggestion into a live price. A recommendation engine
  that could bypass the safeguard by writing rules some other way would
  make the safeguard meaningless; there is deliberately no second way to
  create a `PricingRule`.
