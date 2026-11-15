import { Injectable } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { SetForecastOverrideDto } from "./dto/set-forecast-override.dto.js";

const { Decimal } = Prisma;

const LOOKBACK_DAYS = 84; // 12 weeks — long enough for a weekday pattern, short enough to stay current.
const TREND_WINDOW_DAYS = 28; // compares the most recent 28 days against the 28 before that.
const DEFAULT_LEAD_TIME_DAYS = 3; // used only when neither an override nor a preferred supplier exists.
const SERVICE_LEVEL_Z = 1.65; // ~95% service level for the safety-stock formula.
const EXCESS_THRESHOLD_DAYS = 60; // more than this many days of stock on hand counts as excess.
const PROMOTION_UPLIFT_FACTOR = 1.1;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StockoutRisk = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface IngredientForecast {
  ingredientId: string;
  ingredientName: string;
  kitchenId: string;
  horizonDays: number;
  quantityOnHand: Prisma.Decimal;
  incomingQuantity: Prisma.Decimal;
  averageDailyDemand: Prisma.Decimal;
  forecastDemand: Prisma.Decimal;
  daysOfStockRemaining: number | null;
  leadTimeDays: number;
  leadTimeSource: "override" | "preferred_supplier" | "default";
  safetyStock: Prisma.Decimal;
  safetyStockSource: "override" | "computed";
  reorderPoint: Prisma.Decimal;
  reorderPointSource: "manual" | "recommended";
  reorderRecommended: boolean;
  reorderQuantitySuggested: Prisma.Decimal;
  stockoutRisk: StockoutRisk;
  excessInventory: boolean;
  expiryRisk: boolean;
  promotionUpliftApplied: boolean;
  trendFactor: number;
  explanation: string[];
}

export interface ProductDemandForecast {
  variantId: string;
  productName: string;
  variantName: string;
  horizonDays: number;
  averageDailyDemand: Prisma.Decimal;
  forecastQuantity: Prisma.Decimal;
  trendFactor: number;
  promotionUpliftApplied: boolean;
  explanation: string[];
}

interface DailySeries {
  byDate: Map<string, Prisma.Decimal>;
  totalDays: number;
}

/**
 * Every forecast is computed on demand from existing ledgers (StockMovement,
 * Order/OrderItem) rather than a separately-maintained forecast table — the
 * same "no new write path to keep in sync" philosophy as Prompt 10's reports
 * and Prompt 16's pricing quotes. Nothing here is cached; a forecast is
 * recomputed, fresh, on every read.
 */
@Injectable()
export class ForecastingService {
  constructor(private readonly prisma: PrismaService) {}

  async forecastIngredient(organizationId: string, kitchenId: string, ingredientId: string, horizonDays: number): Promise<IngredientForecast> {
    const kitchen = await assertBelongsToOrg(
      () => this.prisma.kitchen.findFirst({ where: { id: kitchenId, organizationId } }),
      "Kitchen",
    );
    const ingredient = await assertBelongsToOrg(
      () => this.prisma.ingredient.findFirst({ where: { id: ingredientId, organizationId }, include: { preferredSupplier: true } }),
      "Ingredient",
    );
    const [balance, series, incomingQuantity] = await Promise.all([
      this.prisma.stockBalance.findUnique({ where: { kitchenId_ingredientId: { kitchenId: kitchen.id, ingredientId: ingredient.id } } }),
      this.loadDailyConsumption(organizationId, kitchen.id, ingredient.id),
      this.loadIncomingQuantity(organizationId, kitchen.id, ingredient.id),
    ]);

    const promotionUpliftApplied = await this.hasUpcomingPromotionOrCampaign(organizationId, horizonDays);
    return this.buildIngredientForecast(ingredient, kitchen.id, balance, series, incomingQuantity, horizonDays, promotionUpliftApplied);
  }

  /** The dashboard view — every active ingredient at this kitchen, worst stockout risk first. */
  async forecastAllIngredients(organizationId: string, kitchenId: string, horizonDays: number): Promise<IngredientForecast[]> {
    const kitchen = await assertBelongsToOrg(
      () => this.prisma.kitchen.findFirst({ where: { id: kitchenId, organizationId } }),
      "Kitchen",
    );
    const ingredients = await this.prisma.ingredient.findMany({
      where: { organizationId, isActive: true },
      include: { preferredSupplier: true },
      orderBy: { name: "asc" },
    });
    const balances = await this.prisma.stockBalance.findMany({ where: { kitchenId: kitchen.id } });
    const balanceByIngredient = new Map(balances.map((b) => [b.ingredientId, b]));
    const promotionUpliftApplied = await this.hasUpcomingPromotionOrCampaign(organizationId, horizonDays);

    const forecasts = await Promise.all(
      ingredients.map(async (ingredient) => {
        const [series, incomingQuantity] = await Promise.all([
          this.loadDailyConsumption(organizationId, kitchen.id, ingredient.id),
          this.loadIncomingQuantity(organizationId, kitchen.id, ingredient.id),
        ]);
        return this.buildIngredientForecast(
          ingredient,
          kitchen.id,
          balanceByIngredient.get(ingredient.id) ?? null,
          series,
          incomingQuantity,
          horizonDays,
          promotionUpliftApplied,
        );
      }),
    );

    const riskOrder: Record<StockoutRisk, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NONE: 3 };
    return forecasts.sort((a, b) => {
      const riskDiff = riskOrder[a.stockoutRisk] - riskOrder[b.stockoutRisk];
      if (riskDiff !== 0) return riskDiff;
      return (a.daysOfStockRemaining ?? Infinity) - (b.daysOfStockRemaining ?? Infinity);
    });
  }

  async forecastProductDemand(
    organizationId: string,
    variantId: string,
    outletId: string | undefined,
    horizonDays: number,
  ): Promise<ProductDemandForecast> {
    const variant = await assertBelongsToOrg(
      () => this.prisma.productVariant.findFirst({ where: { id: variantId, product: { organizationId } }, include: { product: true } }),
      "Product variant",
    );
    if (outletId) {
      await assertBelongsToOrg(() => this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } }), "Outlet");
    }

    const effectiveFrom = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
    const items = await this.prisma.orderItem.findMany({
      where: {
        variantId,
        status: "ACTIVE",
        order: { organizationId, status: "PAID", closedAt: { gte: effectiveFrom }, ...(outletId ? { outletId } : {}) },
      },
      select: { quantity: true, order: { select: { closedAt: true } } },
      take: 20_000,
    });

    const byDate = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const date = item.order.closedAt!.toISOString().slice(0, 10);
      byDate.set(date, (byDate.get(date) ?? new Decimal(0)).add(item.quantity));
    }
    const series: DailySeries = { byDate, totalDays: LOOKBACK_DAYS };

    const { averageDailyDemand, weekdayFactor } = this.computeWeekdayPattern(series);
    const { trendFactor, explanation: trendExplanation } = this.computeTrendFactor(series);
    const promotionUpliftApplied = await this.hasUpcomingPromotionOrCampaign(organizationId, horizonDays);
    const forecastQuantity = this.projectForward(averageDailyDemand, weekdayFactor, trendFactor, promotionUpliftApplied, horizonDays);

    const explanation = [
      `Average of ${averageDailyDemand.toDecimalPlaces(2)} units/day sold over the trailing ${LOOKBACK_DAYS} days.`,
      ...trendExplanation,
      promotionUpliftApplied
        ? `A running or upcoming marketing campaign/promotion is assumed to lift demand ~${Math.round((PROMOTION_UPLIFT_FACTOR - 1) * 100)}%.`
        : "No running or upcoming promotion/campaign found — no uplift applied.",
    ];

    return {
      variantId: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      horizonDays,
      averageDailyDemand,
      forecastQuantity: forecastQuantity.toDecimalPlaces(2),
      trendFactor,
      promotionUpliftApplied,
      explanation,
    };
  }

  async setForecastOverride(organizationId: string, kitchenId: string, ingredientId: string, dto: SetForecastOverrideDto) {
    const kitchen = await assertBelongsToOrg(
      () => this.prisma.kitchen.findFirst({ where: { id: kitchenId, organizationId } }),
      "Kitchen",
    );
    const ingredient = await assertBelongsToOrg(
      () => this.prisma.ingredient.findFirst({ where: { id: ingredientId, organizationId } }),
      "Ingredient",
    );
    return this.prisma.stockBalance.upsert({
      where: { kitchenId_ingredientId: { kitchenId: kitchen.id, ingredientId: ingredient.id } },
      update: { safetyStockOverride: dto.safetyStockOverride, leadTimeDaysOverride: dto.leadTimeDaysOverride },
      create: {
        organizationId,
        kitchenId: kitchen.id,
        ingredientId: ingredient.id,
        safetyStockOverride: dto.safetyStockOverride,
        leadTimeDaysOverride: dto.leadTimeDaysOverride,
      },
    });
  }

  // ------------------------------------------------------------------------

  private buildIngredientForecast(
    ingredient: { id: string; name: string; shelfLifeDays: number | null; preferredSupplier: { leadTimeDays: number } | null },
    kitchenId: string,
    balance: { quantityOnHand: Prisma.Decimal; reorderPoint: Prisma.Decimal | null; safetyStockOverride: Prisma.Decimal | null; leadTimeDaysOverride: number | null } | null,
    series: DailySeries,
    incomingQuantity: Prisma.Decimal,
    horizonDays: number,
    promotionUpliftApplied: boolean,
  ): IngredientForecast {
    const quantityOnHand = balance?.quantityOnHand ?? new Decimal(0);
    const { averageDailyDemand, weekdayFactor, stdDevDailyDemand } = this.computeWeekdayPattern(series);
    const { trendFactor, explanation: trendExplanation } = this.computeTrendFactor(series);
    const forecastDemand = this.projectForward(averageDailyDemand, weekdayFactor, trendFactor, promotionUpliftApplied, horizonDays);

    let leadTimeDays: number;
    let leadTimeSource: IngredientForecast["leadTimeSource"];
    if (balance?.leadTimeDaysOverride != null) {
      leadTimeDays = balance.leadTimeDaysOverride;
      leadTimeSource = "override";
    } else if (ingredient.preferredSupplier) {
      leadTimeDays = ingredient.preferredSupplier.leadTimeDays;
      leadTimeSource = "preferred_supplier";
    } else {
      leadTimeDays = DEFAULT_LEAD_TIME_DAYS;
      leadTimeSource = "default";
    }

    let safetyStock: Prisma.Decimal;
    let safetyStockSource: IngredientForecast["safetyStockSource"];
    if (balance?.safetyStockOverride != null) {
      safetyStock = balance.safetyStockOverride;
      safetyStockSource = "override";
    } else {
      // Classic safety-stock formula: z-score x demand std-dev x sqrt(lead time) — the standard
      // deviation already captures weekday swings, so this is deliberately not multiplied by
      // the weekday factor again.
      safetyStock = stdDevDailyDemand.mul(Math.sqrt(leadTimeDays)).mul(SERVICE_LEVEL_Z);
      if (safetyStock.isZero() && averageDailyDemand.gt(0)) safetyStock = averageDailyDemand; // thin history: one day's buffer.
      safetyStockSource = "computed";
    }
    safetyStock = safetyStock.toDecimalPlaces(3);

    const recommendedReorderPoint = averageDailyDemand.mul(leadTimeDays).add(safetyStock);
    const reorderPointSource: IngredientForecast["reorderPointSource"] = balance?.reorderPoint != null ? "manual" : "recommended";
    const reorderPoint = balance?.reorderPoint ?? recommendedReorderPoint;

    const positionAfterIncoming = quantityOnHand.add(incomingQuantity);
    const reorderRecommended = positionAfterIncoming.lte(reorderPoint);
    const thirtyDayDemand = this.projectForward(averageDailyDemand, weekdayFactor, trendFactor, promotionUpliftApplied, 30);
    const reorderQuantitySuggested = reorderRecommended
      ? Decimal.max(0, thirtyDayDemand.add(safetyStock).sub(positionAfterIncoming)).toDecimalPlaces(3)
      : new Decimal(0);

    const daysOfStockRemaining = averageDailyDemand.gt(0) ? quantityOnHand.div(averageDailyDemand).toNumber() : null;

    let stockoutRisk: StockoutRisk;
    if (daysOfStockRemaining === null) stockoutRisk = "NONE";
    else if (daysOfStockRemaining < leadTimeDays) stockoutRisk = "HIGH";
    else if (daysOfStockRemaining < leadTimeDays + 7) stockoutRisk = "MEDIUM";
    else stockoutRisk = "LOW";

    const excessInventory = daysOfStockRemaining !== null && daysOfStockRemaining > EXCESS_THRESHOLD_DAYS;
    const expiryRisk =
      ingredient.shelfLifeDays != null && daysOfStockRemaining !== null && daysOfStockRemaining > ingredient.shelfLifeDays;

    const explanation = [
      `Average of ${averageDailyDemand.toDecimalPlaces(3)} ${ingredient.name} units/day consumed over the trailing ${LOOKBACK_DAYS} days.`,
      ...trendExplanation,
      promotionUpliftApplied
        ? `A running or upcoming marketing campaign/promotion is assumed to lift demand ~${Math.round((PROMOTION_UPLIFT_FACTOR - 1) * 100)}%.`
        : "No running or upcoming promotion/campaign found — no uplift applied.",
      `Lead time: ${leadTimeDays} day(s) (${leadTimeSource === "override" ? "manually overridden for this kitchen" : leadTimeSource === "preferred_supplier" ? "from the ingredient's preferred supplier" : "organization default — no preferred supplier set"}).`,
      `Safety stock: ${safetyStock} (${safetyStockSource === "override" ? "manually overridden for this kitchen" : `z=${SERVICE_LEVEL_Z} x demand std-dev x sqrt(lead time)`}).`,
      reorderPointSource === "manual"
        ? `Reorder point: ${reorderPoint} (manually set for this kitchen — the recommended value would be ${recommendedReorderPoint.toDecimalPlaces(3)}).`
        : `Reorder point: ${reorderPoint.toDecimalPlaces(3)} (average daily demand x lead time + safety stock).`,
      daysOfStockRemaining === null
        ? "No recent consumption — stockout risk can't be assessed."
        : `${daysOfStockRemaining.toFixed(1)} day(s) of stock remaining at the current pace.`,
    ];

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      kitchenId,
      horizonDays,
      quantityOnHand,
      incomingQuantity,
      averageDailyDemand: averageDailyDemand.toDecimalPlaces(3),
      forecastDemand: forecastDemand.toDecimalPlaces(3),
      daysOfStockRemaining,
      leadTimeDays,
      leadTimeSource,
      safetyStock,
      safetyStockSource,
      reorderPoint: reorderPoint.toDecimalPlaces(3),
      reorderPointSource,
      reorderRecommended,
      reorderQuantitySuggested,
      stockoutRisk,
      excessInventory,
      expiryRisk,
      promotionUpliftApplied,
      trendFactor,
      explanation,
    };
  }

  /** Bounded the same way every other app-code-grouped report in this codebase is. */
  private async loadDailyConsumption(organizationId: string, kitchenId: string, ingredientId: string): Promise<DailySeries> {
    const from = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
    const movements = await this.prisma.stockMovement.findMany({
      where: { organizationId, kitchenId, ingredientId, type: "CONSUMPTION", createdAt: { gte: from } },
      select: { createdAt: true, quantityDelta: true },
      take: 20_000,
    });
    const byDate = new Map<string, Prisma.Decimal>();
    for (const m of movements) {
      const date = m.createdAt.toISOString().slice(0, 10);
      // Consumption is stored as a negative delta; forecasting works in positive "demand" units.
      byDate.set(date, (byDate.get(date) ?? new Decimal(0)).add(m.quantityDelta.neg()));
    }
    return { byDate, totalDays: LOOKBACK_DAYS };
  }

  private async loadIncomingQuantity(organizationId: string, kitchenId: string, ingredientId: string): Promise<Prisma.Decimal> {
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: {
        ingredientId,
        purchaseOrder: { organizationId, kitchenId, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
      },
      select: { quantityOrdered: true, quantityReceived: true },
    });
    return items.reduce((sum, i) => sum.add(i.quantityOrdered.sub(i.quantityReceived)), new Decimal(0));
  }

  /** Average daily demand, a day-of-week multiplier relative to that average, and the
   *  population standard deviation of daily demand — all from one pass over the series. */
  private computeWeekdayPattern(series: DailySeries): { averageDailyDemand: Prisma.Decimal; weekdayFactor: number[]; stdDevDailyDemand: Prisma.Decimal } {
    const total = [...series.byDate.values()].reduce((sum, v) => sum.add(v), new Decimal(0));
    const averageDailyDemand = series.totalDays > 0 ? total.div(series.totalDays) : new Decimal(0);

    const sumByWeekday = Array<Prisma.Decimal>(7).fill(new Decimal(0));
    const countByWeekday = Array<number>(7).fill(0);
    for (const [dateStr, quantity] of series.byDate) {
      const weekday = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
      sumByWeekday[weekday] = (sumByWeekday[weekday] ?? new Decimal(0)).add(quantity);
      countByWeekday[weekday] = (countByWeekday[weekday] ?? 0) + 1;
    }
    // Every elapsed day in the lookback (not just days with activity) counts toward each
    // weekday's own average, so a weekday with zero consumption still pulls its factor down.
    const weeksInLookback = series.totalDays / 7;
    const weekdayFactor = Array.from({ length: 7 }, (_, d) => {
      if (averageDailyDemand.isZero()) return 1;
      const avgForDay = (sumByWeekday[d] ?? new Decimal(0)).div(Math.max(1, weeksInLookback));
      return avgForDay.div(averageDailyDemand).toNumber();
    });

    // Population variance over every elapsed day (zero-demand days included).
    let sumSquaredDiff = new Decimal(0);
    for (let i = 0; i < series.totalDays; i++) {
      const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
      const quantity = series.byDate.get(date) ?? new Decimal(0);
      sumSquaredDiff = sumSquaredDiff.add(quantity.sub(averageDailyDemand).pow(2));
    }
    const variance = series.totalDays > 0 ? sumSquaredDiff.div(series.totalDays) : new Decimal(0);
    const stdDevDailyDemand = new Decimal(Math.sqrt(variance.toNumber()));

    return { averageDailyDemand, weekdayFactor, stdDevDailyDemand };
  }

  /** Compares the most recent TREND_WINDOW_DAYS against the TREND_WINDOW_DAYS before that;
   *  clamped so a handful of noisy recent days can't extrapolate into an absurd forecast, and
   *  skipped entirely (factor 1) when there isn't enough history to compare two full windows. */
  private computeTrendFactor(series: DailySeries): { trendFactor: number; explanation: string[] } {
    if (series.totalDays < TREND_WINDOW_DAYS * 2) {
      return { trendFactor: 1, explanation: ["Not enough history yet for a seasonal trend adjustment."] };
    }
    const sumWindow = (startDaysAgo: number, endDaysAgo: number): Prisma.Decimal => {
      let sum = new Decimal(0);
      for (let i = startDaysAgo; i < endDaysAgo; i++) {
        const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
        sum = sum.add(series.byDate.get(date) ?? new Decimal(0));
      }
      return sum;
    };
    const recent = sumWindow(0, TREND_WINDOW_DAYS);
    const prior = sumWindow(TREND_WINDOW_DAYS, TREND_WINDOW_DAYS * 2);
    if (prior.isZero()) return { trendFactor: 1, explanation: ["No demand in the prior comparison window — trend left neutral."] };

    const rawTrend = recent.div(prior).toNumber();
    const trendFactor = Math.max(0.5, Math.min(2, rawTrend));
    const direction = trendFactor > 1.02 ? "up" : trendFactor < 0.98 ? "down" : "flat";
    return {
      trendFactor,
      explanation: [
        `Demand trend is ${direction} ${Math.round(Math.abs(trendFactor - 1) * 100)}% vs. the prior ${TREND_WINDOW_DAYS} days (clamped to 0.5x-2x).`,
      ],
    };
  }

  private projectForward(
    averageDailyDemand: Prisma.Decimal,
    weekdayFactor: number[],
    trendFactor: number,
    promotionUpliftApplied: boolean,
    horizonDays: number,
  ): Prisma.Decimal {
    let total = new Decimal(0);
    for (let i = 1; i <= horizonDays; i++) {
      const date = new Date(Date.now() + i * DAY_MS);
      const factor = weekdayFactor[date.getUTCDay()] ?? 1;
      total = total.add(averageDailyDemand.mul(factor));
    }
    total = total.mul(trendFactor);
    if (promotionUpliftApplied) total = total.mul(PROMOTION_UPLIFT_FACTOR);
    return total;
  }

  private async hasUpcomingPromotionOrCampaign(organizationId: string, horizonDays: number): Promise<boolean> {
    const now = new Date();
    const horizonEnd = new Date(Date.now() + horizonDays * DAY_MS);
    const [promotion, campaign] = await Promise.all([
      this.prisma.promotion.findFirst({
        where: {
          organizationId,
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: horizonEnd } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
      }),
      this.prisma.campaign.findFirst({
        where: {
          organizationId,
          status: { in: ["RUNNING", "SCHEDULED"] },
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: horizonEnd } }],
        },
      }),
    ]);
    return Boolean(promotion || campaign);
  }
}
