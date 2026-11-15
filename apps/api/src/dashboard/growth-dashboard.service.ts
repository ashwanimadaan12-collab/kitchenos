import { Injectable } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { GrowthDashboardFilterDto, ReportFilterDto } from "@kitchenos/shared";
import { CostingService } from "../costing/costing.service.js";
import { KitchensService } from "../kitchens/kitchens.service.js";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { ForecastingService } from "../inventory/forecasting.service.js";
import { PromotionRecommendationsService } from "../promotions/recommendations.service.js";
import { ReportsService } from "../reports/reports.service.js";
import { resolveVariantCost } from "../common/utils/resolve-variant-cost.util.js";

const { Decimal } = Prisma;

/**
 * Prompt 20's consolidated owner dashboard. Every metric here reuses a service built in an
 * earlier milestone rather than introducing new domain logic — this module's own code is just
 * the aggregation/assembly glue (contribution, profitability and repeat-rate math) plus the two
 * small genuinely-new pieces (loyalty liability, campaign ROI). See each private method for the
 * specific report it reconciles against; nothing here maintains its own rollup table, so every
 * figure is always derived live from Order/OrderItem/Expense/Customer — the same "computed on
 * demand" tradeoff ReportsService documents for Prompt 10.
 */
@Injectable()
export class GrowthDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly kitchens: KitchensService,
    private readonly loyalty: LoyaltyService,
    private readonly campaigns: CampaignsService,
    private readonly forecasting: ForecastingService,
    private readonly recommendations: PromotionRecommendationsService,
    private readonly reports: ReportsService,
  ) {}

  async getDashboard(organizationId: string, filters: GrowthDashboardFilterDto) {
    const reportFilters: ReportFilterDto = {
      from: filters.from,
      to: filters.to,
      brandId: filters.brandId,
      outletId: filters.outletId,
      channel: filters.channel,
    };

    const [
      salesSummary,
      brandDemand,
      outletDemand,
      topProducts,
      weekday,
      peakAndSlowHours,
      promotionRecommendations,
      pointsLiability,
      campaignROI,
      customerRepeatRate,
      forecastBreakdown,
      discountCandidates,
      comboCandidates,
      segmentCandidates,
    ] = await Promise.all([
      this.reports.salesSummary(organizationId, reportFilters),
      this.reports.brandDemand(organizationId, reportFilters),
      this.reports.outletDemand(organizationId, reportFilters),
      this.reports.topProducts(organizationId, { ...reportFilters, limit: 10 }),
      this.reports.weekdayDistribution(organizationId, reportFilters),
      this.reports.peakAndSlowHours(organizationId, reportFilters),
      this.reports.promotionRecommendations(organizationId, reportFilters),
      this.loyalty.getPointsLiability(organizationId),
      this.getCampaignROI(organizationId),
      this.getCustomerRepeatRate(organizationId, reportFilters),
      this.getStockoutAndPurchaseRecommendations(organizationId, filters.kitchenId),
      this.recommendations.discountCandidates(organizationId, 5),
      this.recommendations.comboPromotionCandidates(organizationId, 5),
      this.recommendations.segmentTargetingCandidates(organizationId),
    ]);

    const { totalContribution, brandProfitability, outletProfitability } = await this.getProfitability(
      organizationId,
      reportFilters,
      brandDemand,
      outletDemand,
    );

    // weekdayDistribution always returns exactly 7 entries (one per day of week), so this never
    // reduces over an empty array.
    const bestSalesDay = weekday.reduce((best, day) => (day.orderCount > best.orderCount ? day : best), weekday[0]!);

    return {
      totalRevenue: salesSummary.total,
      totalContribution,
      brandProfitability,
      outletProfitability,
      productPerformance: topProducts,
      customerRepeatRate,
      loyaltyPointLiability: pointsLiability,
      campaignROI,
      bestSalesDay: { dayOfWeek: bestSalesDay.dayOfWeek, orderCount: bestSalesDay.orderCount, revenue: bestSalesDay.revenue },
      peakSalesHour: peakAndSlowHours.peakHour,
      lowDemandPeriods: {
        slowestHour: peakAndSlowHours.slowHour,
        quietSlots: promotionRecommendations,
      },
      stockoutRisks: forecastBreakdown.risks,
      purchaseRecommendations: forecastBreakdown.purchaseRecommendations,
      promotionOpportunities: {
        discountCandidates,
        comboCandidates,
        segmentCandidates,
      },
    };
  }

  /**
   * Revenue minus COGS, both org-wide and rolled up per brand/outlet. Expenses are only
   * attributable at brand/outlet level when they carry an outletId — an org-wide `Expense`
   * (outletId null) has no single brand/outlet to charge it to, so it's excluded from these two
   * breakdowns and left in the org-wide P&L (ReportsService.profitLoss) where it already
   * belongs. Total contribution (the org-wide figure) never nets expenses at all — it mirrors
   * ReportsService.promotionRecommendations' own "revenue minus COGS" contribution definition,
   * which is deliberately expense-agnostic.
   */
  private async getProfitability(
    organizationId: string,
    filters: ReportFilterDto,
    brandDemand: Awaited<ReturnType<ReportsService["brandDemand"]>>,
    outletDemand: Awaited<ReturnType<ReportsService["outletDemand"]>>,
  ) {
    const where = this.reports.buildOrderWhere(organizationId, filters);
    const items = await this.prisma.orderItem.findMany({
      where: { status: "ACTIVE", order: where },
      select: { variantId: true, quantity: true, lineSubtotal: true, order: { select: { outletId: true } } },
      take: 20_000,
    });

    const variantIds = [...new Set(items.map((i) => i.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, kind: true, landedCost: true, purchasePrice: true },
    });
    const costPerVariant = new Map<string, Prisma.Decimal | null>();
    await Promise.all(
      variants.map(async (variant) => {
        costPerVariant.set(variant.id, await resolveVariantCost(this.costing, organizationId, variant));
      }),
    );

    let totalCogs = new Decimal(0);
    const cogsByOutlet = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const unitCost = costPerVariant.get(item.variantId);
      const cost = unitCost ? unitCost.mul(item.quantity) : new Decimal(0);
      totalCogs = totalCogs.add(cost);
      const outletId = item.order.outletId;
      cogsByOutlet.set(outletId, (cogsByOutlet.get(outletId) ?? new Decimal(0)).add(cost));
    }
    const totalContribution = (await this.reports.salesSummary(organizationId, filters)).total.sub(totalCogs);

    const outlets = await this.prisma.outlet.findMany({ where: { organizationId }, select: { id: true, brandId: true } });
    const brandByOutlet = new Map(outlets.map((o) => [o.id, o.brandId]));

    const expenseWhere: Prisma.ExpenseWhereInput = {
      organizationId,
      ...(filters.from || filters.to
        ? { incurredAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } }
        : {}),
    };
    const expenseGroups = await this.prisma.expense.groupBy({ by: ["outletId"], where: expenseWhere, _sum: { amount: true } });
    const expenseByOutlet = new Map(expenseGroups.map((g) => [g.outletId, g._sum.amount ?? new Decimal(0)]));

    const outletProfitability = outletDemand.map((o) => {
      const cogs = cogsByOutlet.get(o.outletId) ?? new Decimal(0);
      const expenses = expenseByOutlet.get(o.outletId) ?? new Decimal(0);
      return {
        outletId: o.outletId,
        outletName: o.outletName,
        revenue: o.revenue,
        cogs,
        expenses,
        profit: o.revenue.sub(cogs).sub(expenses),
      };
    });

    const cogsByBrand = new Map<string, Prisma.Decimal>();
    const expenseByBrand = new Map<string, Prisma.Decimal>();
    for (const [outletId, cogs] of cogsByOutlet) {
      const brandId = brandByOutlet.get(outletId);
      if (!brandId) continue;
      cogsByBrand.set(brandId, (cogsByBrand.get(brandId) ?? new Decimal(0)).add(cogs));
    }
    for (const [outletId, amount] of expenseByOutlet) {
      const brandId = outletId ? brandByOutlet.get(outletId) : null;
      if (!brandId) continue; // Org-wide (outletId null) expenses aren't attributable to one brand.
      expenseByBrand.set(brandId, (expenseByBrand.get(brandId) ?? new Decimal(0)).add(amount));
    }
    const brandProfitability = brandDemand.map((b) => {
      const cogs = cogsByBrand.get(b.brandId) ?? new Decimal(0);
      const expenses = expenseByBrand.get(b.brandId) ?? new Decimal(0);
      return {
        brandId: b.brandId,
        brandName: b.brandName,
        revenue: b.revenue,
        cogs,
        expenses,
        profit: b.revenue.sub(cogs).sub(expenses),
      };
    });

    return { totalContribution, brandProfitability, outletProfitability };
  }

  /** (# customers with >=2 PAID orders) / (# customers with >=1 PAID order) — the same
   *  groupBy+having technique SegmentsService uses to resolve its REPEAT segment (Prompt 15). */
  private async getCustomerRepeatRate(organizationId: string, filters: ReportFilterDto) {
    const where = this.reports.buildOrderWhere(organizationId, filters);
    const grouped = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: { ...where, customerId: { not: null } },
      _count: { _all: true },
    });
    const totalCustomers = grouped.length;
    const repeatCustomers = grouped.filter((g) => g._count._all >= 2).length;
    return {
      totalCustomers,
      repeatCustomers,
      repeatRatePercent: totalCustomers > 0 ? Number(((repeatCustomers / totalCustomers) * 100).toFixed(2)) : 0,
    };
  }

  /**
   * WhatsApp ROI aggregates each campaign's CampaignRecipient.attributedRevenue (via
   * CampaignsService.getStats, Prompt 15) against its message cost (sent count x
   * costPerMessage, the same unit cost CampaignsService.previewReach already uses for budget
   * sizing). SMS has no underlying data source: CampaignsService.create only ever accepts
   * active WHATSAPP/PROMOTIONAL templates, so there has never been an SMS campaign to measure —
   * reported honestly as null rather than fabricated, per this project's no-fake-data rule.
   */
  private async getCampaignROI(organizationId: string) {
    const campaignList = await this.campaigns.list(organizationId, {});
    let revenue = new Decimal(0);
    let cost = new Decimal(0);
    for (const campaign of campaignList) {
      const stats = await this.campaigns.getStats(organizationId, campaign.id);
      revenue = revenue.add(stats.revenueAttributed);
      cost = cost.add(campaign.costPerMessage.mul(stats.sent));
    }
    const roiPercent = cost.gt(0) ? revenue.sub(cost).div(cost).mul(100) : null;
    return {
      whatsapp: { revenue, cost, roiPercent },
      sms: {
        revenue: new Decimal(0),
        cost: new Decimal(0),
        roiPercent: null,
        note: "This platform's campaign manager is WhatsApp-only by design (Prompt 15) — there is no SMS campaign data to report.",
      },
    };
  }

  /**
   * Forecasting is inherently kitchen-scoped (ForecastingService.forecastAllIngredients,
   * Prompt 18), so without a kitchenId drill-down this loops every kitchen in the org and
   * aggregates — the same "fine at this data volume" scale assumption the forecaster itself
   * documents.
   */
  private async getStockoutAndPurchaseRecommendations(organizationId: string, kitchenId?: string) {
    const kitchenIds = kitchenId
      ? [kitchenId]
      : (await this.kitchens.list(organizationId)).map((k) => k.id);
    const forecasts = (
      await Promise.all(kitchenIds.map((id) => this.forecasting.forecastAllIngredients(organizationId, id, 14)))
    ).flat();
    return {
      risks: forecasts.filter((f) => f.stockoutRisk === "HIGH" || f.stockoutRisk === "MEDIUM"),
      purchaseRecommendations: forecasts.filter((f) => f.reorderRecommended),
    };
  }
}
