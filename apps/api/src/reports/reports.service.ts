import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { resolveVariantCost } from "../common/utils/resolve-variant-cost.util.js";
import type { Env } from "../config/env.schema.js";
import type { ReportFilterDto } from "./dto/report-filter.dto.js";
import type { TopProductsFilterDto } from "./dto/top-products-filter.dto.js";

const { Decimal } = Prisma;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every report below is computed on demand from the existing operational
 * tables (Order/OrderItem/Payment/PromotionRedemption) rather than from a
 * separate materialized/rollup schema — there's no new write path to keep
 * in sync, and at this data volume the aggregate queries are cheap. A
 * high-traffic deployment would eventually want a rollup table refreshed
 * on a schedule; that's a scaling concern, not a correctness one, and is
 * out of scope here.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Hour-of-day and day-of-week buckets in the restaurant's own clock.
   *
   * These used to read getUTCHours()/getUTCDay() straight off closedAt, which
   * for an Indian outlet moved every order 5.5 hours earlier: the 9pm dinner
   * rush was reported as a 3:30pm one, and anything sold after 5:30am IST on a
   * Monday fell into Sunday's column. Shifting by the configured offset first
   * puts both back where the owner would put them.
   */
  private localBucket(at: Date): { dayOfWeek: number; hour: number } {
    const offsetMinutes = this.config.get("REPORT_UTC_OFFSET_MINUTES", { infer: true });
    const shifted = new Date(at.getTime() + offsetMinutes * 60_000);
    return { dayOfWeek: shifted.getUTCDay(), hour: shifted.getUTCHours() };
  }

  /** Every report is scoped to PAID orders only — OPEN orders aren't final revenue, and VOIDED orders never were.
   *  Public so other modules (e.g. the growth dashboard) can scope their own queries to the same order set. */
  buildOrderWhere(organizationId: string, filters: ReportFilterDto): Prisma.OrderWhereInput {
    return {
      organizationId,
      status: "PAID",
      ...(filters.outletId ? { outletId: filters.outletId } : {}),
      ...(filters.brandId ? { outlet: { brandId: filters.brandId } } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.from || filters.to
        ? {
            closedAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lt: filters.to } : {}),
            },
          }
        : {}),
    };
  }

  async salesSummary(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const agg = await this.prisma.order.aggregate({
      where,
      _count: { _all: true },
      _sum: { subtotal: true, taxTotal: true, discountAmount: true, total: true },
    });
    const orderCount = agg._count._all;
    const total = agg._sum.total ?? new Decimal(0);
    return {
      orderCount,
      subtotal: agg._sum.subtotal ?? new Decimal(0),
      taxTotal: agg._sum.taxTotal ?? new Decimal(0),
      discountAmount: agg._sum.discountAmount ?? new Decimal(0),
      total,
      averageOrderValue: orderCount > 0 ? total.div(orderCount) : new Decimal(0),
    };
  }

  /**
   * Revenue per calendar day. Grouped in application code rather than via a
   * date-truncating SQL expression — simpler, and avoids hand-building any
   * raw SQL — which is fine at the order volumes this aggregates over.
   */
  async salesByDay(organizationId: string, filters: ReportFilterDto) {
    // Unlike the other reports (which aggregate in SQL), this one groups by day in
    // application code, so it has to load one row per order — without a bound, a caller
    // that omits both from/to would pull the organization's entire PAID order history into
    // memory. Default to a trailing 90-day window when neither bound is given, and cap the
    // row count as a hard backstop regardless of the filters supplied.
    const effectiveFilters: ReportFilterDto =
      filters.from || filters.to ? filters : { ...filters, from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) };
    const where = this.buildOrderWhere(organizationId, effectiveFilters);
    const orders = await this.prisma.order.findMany({
      where,
      select: { closedAt: true, total: true },
      orderBy: { closedAt: "asc" },
      take: 20_000,
    });

    const byDay = new Map<string, Prisma.Decimal>();
    for (const order of orders) {
      const day = order.closedAt!.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? new Decimal(0)).add(order.total));
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));
  }

  /**
   * Same "bound it, don't trust the caller to narrow the window" guard as
   * salesByDay — every demand-analytics report below needs one row per
   * order (day-of-week/hour-of-day/month aren't columns, so they can't be
   * grouped in SQL without raw date-truncation), so they all share this
   * loader rather than each re-deriving the same default-window-plus-cap.
   */
  private async loadBoundedOrders(organizationId: string, filters: ReportFilterDto, withItems: boolean) {
    const effectiveFilters: ReportFilterDto =
      filters.from || filters.to ? filters : { ...filters, from: new Date(Date.now() - 90 * DAY_MS) };
    const where = this.buildOrderWhere(organizationId, effectiveFilters);
    return this.prisma.order.findMany({
      where,
      select: {
        closedAt: true,
        total: true,
        ...(withItems
          ? { items: { where: { status: "ACTIVE" }, select: { variantId: true, quantity: true, lineSubtotal: true } } }
          : {}),
      },
      orderBy: { closedAt: "asc" },
      take: 20_000,
    });
  }

  /** Revenue/order-count/AOV grouped by day of week (0 = Sunday .. 6 = Saturday) in the
   *  restaurant's own clock — see localBucket. */
  async weekdayDistribution(organizationId: string, filters: ReportFilterDto) {
    const orders = await this.loadBoundedOrders(organizationId, filters, false);
    const byDay = new Map<number, { orderCount: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const day = this.localBucket(order.closedAt!).dayOfWeek;
      const entry = byDay.get(day) ?? { orderCount: 0, revenue: new Decimal(0) };
      entry.orderCount += 1;
      entry.revenue = entry.revenue.add(order.total);
      byDay.set(day, entry);
    }
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const entry = byDay.get(dayOfWeek) ?? { orderCount: 0, revenue: new Decimal(0) };
      return {
        dayOfWeek,
        orderCount: entry.orderCount,
        revenue: entry.revenue,
        averageOrderValue: entry.orderCount > 0 ? entry.revenue.div(entry.orderCount) : new Decimal(0),
      };
    });
  }

  /** Revenue/order-count/AOV grouped by hour of day (0-23) in the restaurant's own clock. */
  async hourlyDistribution(organizationId: string, filters: ReportFilterDto) {
    const orders = await this.loadBoundedOrders(organizationId, filters, false);
    const byHour = new Map<number, { orderCount: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const hour = this.localBucket(order.closedAt!).hour;
      const entry = byHour.get(hour) ?? { orderCount: 0, revenue: new Decimal(0) };
      entry.orderCount += 1;
      entry.revenue = entry.revenue.add(order.total);
      byHour.set(hour, entry);
    }
    return Array.from({ length: 24 }, (_, hour) => {
      const entry = byHour.get(hour) ?? { orderCount: 0, revenue: new Decimal(0) };
      return {
        hour,
        orderCount: entry.orderCount,
        revenue: entry.revenue,
        averageOrderValue: entry.orderCount > 0 ? entry.revenue.div(entry.orderCount) : new Decimal(0),
      };
    });
  }

  /** The weekday x hour matrix behind the interactive heatmap — only cells with at least one
   *  order are returned; a zero-order cell (there are up to 168) is the caller's to fill in. */
  async demandHeatmap(organizationId: string, filters: ReportFilterDto) {
    const orders = await this.loadBoundedOrders(organizationId, filters, false);
    const byCell = new Map<string, { dayOfWeek: number; hour: number; orderCount: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const { dayOfWeek, hour } = this.localBucket(order.closedAt!);
      const key = `${dayOfWeek}-${hour}`;
      const entry = byCell.get(key) ?? { dayOfWeek, hour, orderCount: 0, revenue: new Decimal(0) };
      entry.orderCount += 1;
      entry.revenue = entry.revenue.add(order.total);
      byCell.set(key, entry);
    }
    return Array.from(byCell.values()).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  }

  /** The single busiest and quietest hour among those that actually had at least one order —
   *  an hour with zero orders is unmeasured/closed, not "slow". */
  async peakAndSlowHours(organizationId: string, filters: ReportFilterDto) {
    const hourly = await this.hourlyDistribution(organizationId, filters);
    const active = hourly.filter((h) => h.orderCount > 0);
    if (active.length === 0) return { peakHour: null, slowHour: null };
    const peak = active.reduce((a, b) => (b.orderCount > a.orderCount ? b : a));
    const slow = active.reduce((a, b) => (b.orderCount < a.orderCount ? b : a));
    return {
      peakHour: { hour: peak.hour, orderCount: peak.orderCount, revenue: peak.revenue },
      slowHour: { hour: slow.hour, orderCount: slow.orderCount, revenue: slow.revenue },
    };
  }

  /** Revenue/order-count/AOV grouped by calendar month (YYYY-MM, UTC) — the seasonal-trend view. */
  async monthlyTrend(organizationId: string, filters: ReportFilterDto) {
    const orders = await this.loadBoundedOrders(organizationId, filters, false);
    const byMonth = new Map<string, { orderCount: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const month = order.closedAt!.toISOString().slice(0, 7);
      const entry = byMonth.get(month) ?? { orderCount: 0, revenue: new Decimal(0) };
      entry.orderCount += 1;
      entry.revenue = entry.revenue.add(order.total);
      byMonth.set(month, entry);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, entry]) => ({
        month,
        orderCount: entry.orderCount,
        revenue: entry.revenue,
        averageOrderValue: entry.orderCount > 0 ? entry.revenue.div(entry.orderCount) : new Decimal(0),
      }));
  }

  /** Revenue/order-count grouped by brand — Order has no brandId column, so this groups by the
   *  real scalar outletId first (cheap, few outlets) and rolls that up to each outlet's brand
   *  in application code, the same small-cardinality tradeoff as Prompt 15's segment resolvers. */
  async brandDemand(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.order.groupBy({
      by: ["outletId"],
      where,
      _count: { _all: true },
      _sum: { total: true },
    });
    const outlets = await this.prisma.outlet.findMany({
      where: { id: { in: grouped.map((g) => g.outletId) } },
      include: { brand: { select: { id: true, name: true } } },
    });
    const brandByOutlet = new Map(outlets.map((o) => [o.id, o.brand]));

    const byBrand = new Map<string, { brandName: string; orderCount: number; revenue: Prisma.Decimal }>();
    for (const g of grouped) {
      const brand = brandByOutlet.get(g.outletId);
      if (!brand) continue;
      const entry = byBrand.get(brand.id) ?? { brandName: brand.name, orderCount: 0, revenue: new Decimal(0) };
      entry.orderCount += g._count._all;
      entry.revenue = entry.revenue.add(g._sum.total ?? new Decimal(0));
      byBrand.set(brand.id, entry);
    }
    return [...byBrand.entries()]
      .map(([brandId, v]) => ({
        brandId,
        brandName: v.brandName,
        orderCount: v.orderCount,
        revenue: v.revenue,
        averageOrderValue: v.orderCount > 0 ? v.revenue.div(v.orderCount) : new Decimal(0),
      }))
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }

  /** Revenue/order-count grouped by outlet — outletId is a real scalar column, so this groups
   *  natively in SQL rather than in application code. */
  async outletDemand(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.order.groupBy({
      by: ["outletId"],
      where,
      _count: { _all: true },
      _sum: { total: true },
    });
    const outlets = await this.prisma.outlet.findMany({ where: { id: { in: grouped.map((g) => g.outletId) } } });
    const outletById = new Map(outlets.map((o) => [o.id, o]));
    return grouped
      .map((g) => {
        const revenue = g._sum.total ?? new Decimal(0);
        const orderCount = g._count._all;
        return {
          outletId: g.outletId,
          outletName: outletById.get(g.outletId)?.name ?? "Unknown",
          orderCount,
          revenue,
          averageOrderValue: orderCount > 0 ? revenue.div(orderCount) : new Decimal(0),
        };
      })
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }

  /** Revenue/order-count grouped by channel — channel is a real scalar column on Order. */
  async channelDemand(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.order.groupBy({
      by: ["channel"],
      where,
      _count: { _all: true },
      _sum: { total: true },
    });
    return grouped
      .map((g) => {
        const revenue = g._sum.total ?? new Decimal(0);
        const orderCount = g._count._all;
        return {
          channel: g.channel,
          orderCount,
          revenue,
          averageOrderValue: orderCount > 0 ? revenue.div(orderCount) : new Decimal(0),
        };
      })
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }

  /**
   * Flags the weekday x hour slots with materially fewer orders than average and recommends a
   * promotion for each — but sizes the recommendation, and picks which KIND of promotion to
   * suggest, by estimated contribution (revenue minus known cost-of-goods for prepared-food
   * and retail-commodity variants alike), not by order count alone. A slot that's quiet but
   * already thin-margin gets pointed toward a bundle/upsell instead of a further discount,
   * since discounting it further would erode the contribution it does have; a quiet slot with
   * healthy margin gets pointed toward a volume-driving discount instead, since it can absorb
   * one. Cost is a revenue-minus-COGS proxy, not a full margin computation (COGS data can be
   * incomplete — see CostingService's own missingCostIngredientIds — so an item with unknown
   * cost counts its full revenue as contribution rather than blocking the estimate).
   */
  async promotionRecommendations(organizationId: string, filters: ReportFilterDto, limit = 5) {
    const orders = await this.loadBoundedOrders(organizationId, filters, true);
    if (orders.length === 0) return [];

    const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId)))];
    const costPerVariant = await this.resolveCostPerVariant(organizationId, variantIds);

    interface SlotAccumulator {
      dayOfWeek: number;
      hour: number;
      orderCount: number;
      revenue: Prisma.Decimal;
      contribution: Prisma.Decimal;
    }
    const bySlot = new Map<string, SlotAccumulator>();
    for (const order of orders) {
      const { dayOfWeek, hour } = this.localBucket(order.closedAt!);
      const key = `${dayOfWeek}-${hour}`;
      const slot = bySlot.get(key) ?? { dayOfWeek, hour, orderCount: 0, revenue: new Decimal(0), contribution: new Decimal(0) };
      slot.orderCount += 1;
      slot.revenue = slot.revenue.add(order.total);
      let orderContribution = order.total;
      for (const item of order.items) {
        const unitCost = costPerVariant.get(item.variantId);
        if (unitCost) orderContribution = orderContribution.sub(unitCost.mul(item.quantity));
      }
      slot.contribution = slot.contribution.add(orderContribution);
      bySlot.set(key, slot);
    }

    const slots = [...bySlot.values()];
    const totalOrders = slots.reduce((sum, s) => sum + s.orderCount, 0);
    const totalContribution = slots.reduce((sum, s) => sum.add(s.contribution), new Decimal(0));
    const averageOrderCount = totalOrders / slots.length;
    const averageContributionPerOrder = totalOrders > 0 ? totalContribution.div(totalOrders) : new Decimal(0);

    return slots
      .filter((s) => s.orderCount < averageOrderCount * 0.5)
      .sort((a, b) => a.orderCount - b.orderCount)
      .slice(0, limit)
      .map((s) => {
        const contributionPerOrder = s.orderCount > 0 ? s.contribution.div(s.orderCount) : new Decimal(0);
        const healthyMargin = contributionPerOrder.gte(averageContributionPerOrder);
        return {
          dayOfWeek: s.dayOfWeek,
          hour: s.hour,
          orderCount: s.orderCount,
          revenue: s.revenue,
          estimatedContribution: s.contribution,
          contributionPerOrder,
          suggestion: healthyMargin
            ? "Healthy margin in this slot — a volume-driving discount can safely bring in more orders without hurting profitability."
            : "Margin is already thin in this slot — favor a combo or bundle upsell over a further discount to protect contribution.",
        };
      });
  }

  /** PREPARED_FOOD variants cost from their Recipe (CostingService, reused from Prompt 07);
   *  RETAIL_COMMODITY variants cost from their own landed/purchase cost fields (Prompt 16) —
   *  the same dual cost source PricingRulesService.resolveCost uses. Returns null for a
   *  variant whose cost can't be determined, rather than failing the whole report over it. */
  private async resolveCostPerVariant(organizationId: string, variantIds: string[]): Promise<Map<string, Prisma.Decimal | null>> {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, kind: true, landedCost: true, purchasePrice: true },
    });
    const result = new Map<string, Prisma.Decimal | null>();
    await Promise.all(
      variants.map(async (variant) => {
        result.set(variant.id, await resolveVariantCost(this.costing, organizationId, variant));
      }),
    );
    return result;
  }

  /** Best-selling variants by revenue, across ordinary sales and combo components alike. */
  async topProducts(organizationId: string, filters: TopProductsFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { status: "ACTIVE", order: where },
      _sum: { quantity: true, lineSubtotal: true },
      orderBy: { _sum: { lineSubtotal: "desc" } },
      take: filters.limit ?? 10,
    });

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: grouped.map((g) => g.variantId) } },
      include: { product: true },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    return grouped.map((g) => {
      const variant = variantById.get(g.variantId);
      return {
        variantId: g.variantId,
        productName: variant?.product.name ?? "Unknown",
        variantName: variant?.name ?? "Unknown",
        quantitySold: g._sum.quantity ?? 0,
        revenue: g._sum.lineSubtotal ?? new Decimal(0),
      };
    });
  }

  /**
   * How many times each combo was actually sold (instances, not component
   * lines) and the revenue it brought in. Grouping by [comboId,
   * comboInstanceId] first collapses each instance's component lines into
   * one row (their lineSubtotals already sum to that instance's exact
   * share of comboPrice), so counting those rows counts instances sold.
   */
  async comboPerformance(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const rows = await this.prisma.orderItem.groupBy({
      by: ["comboId", "comboInstanceId"],
      where: { status: "ACTIVE", comboId: { not: null }, order: where },
      _sum: { lineSubtotal: true },
    });

    const byCombo = new Map<string, { instancesSold: number; revenue: Prisma.Decimal }>();
    for (const row of rows) {
      const comboId = row.comboId as string;
      const entry = byCombo.get(comboId) ?? { instancesSold: 0, revenue: new Decimal(0) };
      entry.instancesSold += 1;
      entry.revenue = entry.revenue.add(row._sum.lineSubtotal ?? new Decimal(0));
      byCombo.set(comboId, entry);
    }

    const combos = await this.prisma.combo.findMany({ where: { id: { in: [...byCombo.keys()] } } });
    const comboById = new Map(combos.map((c) => [c.id, c]));

    return [...byCombo.entries()]
      .map(([comboId, v]) => ({
        comboId,
        name: comboById.get(comboId)?.name ?? "Unknown",
        instancesSold: v.instancesSold,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }

  async paymentMethods(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.payment.groupBy({
      by: ["method"],
      where: { order: where },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ method: g.method, count: g._count._all, amount: g._sum.amount ?? new Decimal(0) }));
  }

  /** Revenue (PAID orders) minus expenses over the same filtered window — the simplest possible P&L. */
  async profitLoss(organizationId: string, filters: ReportFilterDto) {
    const orderWhere = this.buildOrderWhere(organizationId, filters);
    const revenueAgg = await this.prisma.order.aggregate({ where: orderWhere, _sum: { total: true } });
    const revenue = revenueAgg._sum.total ?? new Decimal(0);

    const expenseWhere: Prisma.ExpenseWhereInput = {
      organizationId,
      ...(filters.outletId ? { outletId: filters.outletId } : {}),
      ...(filters.brandId ? { outlet: { brandId: filters.brandId } } : {}),
      ...(filters.from || filters.to
        ? {
            incurredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lt: filters.to } : {}),
            },
          }
        : {}),
    };
    const expenseAgg = await this.prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } });
    const expenses = expenseAgg._sum.amount ?? new Decimal(0);

    return { revenue, expenses, netProfit: revenue.sub(expenses) };
  }

  /** Redemption count and total discount given per promotion — counted from PromotionRedemption, the source of truth. */
  async promotionUsage(organizationId: string, filters: ReportFilterDto) {
    const where = this.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.promotionRedemption.groupBy({
      by: ["promotionId"],
      where: { organizationId, order: where },
      _sum: { discountAmount: true },
      _count: { _all: true },
    });

    const promotions = await this.prisma.promotion.findMany({ where: { id: { in: grouped.map((g) => g.promotionId) } } });
    const promotionById = new Map(promotions.map((p) => [p.id, p]));

    return grouped.map((g) => ({
      promotionId: g.promotionId,
      code: promotionById.get(g.promotionId)?.code ?? "Unknown",
      redemptions: g._count._all,
      totalDiscount: g._sum.discountAmount ?? new Decimal(0),
    }));
  }
}
