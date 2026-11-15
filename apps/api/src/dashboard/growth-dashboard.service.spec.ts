import { Test } from "@nestjs/testing";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { KitchensService } from "../kitchens/kitchens.service.js";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { ForecastingService } from "../inventory/forecasting.service.js";
import { PromotionRecommendationsService } from "../promotions/recommendations.service.js";
import { ReportsService } from "../reports/reports.service.js";
import { GrowthDashboardService } from "./growth-dashboard.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("GrowthDashboardService", () => {
  let service: GrowthDashboardService;
  let prisma: {
    orderItem: { findMany: jest.Mock };
    productVariant: { findMany: jest.Mock };
    outlet: { findMany: jest.Mock };
    expense: { groupBy: jest.Mock };
    order: { groupBy: jest.Mock };
  };
  let costing: { computeVariantCost: jest.Mock };
  let kitchens: { list: jest.Mock };
  let loyalty: { getPointsLiability: jest.Mock };
  let campaigns: { list: jest.Mock; getStats: jest.Mock };
  let forecasting: { forecastAllIngredients: jest.Mock };
  let recommendations: { discountCandidates: jest.Mock; comboPromotionCandidates: jest.Mock; segmentTargetingCandidates: jest.Mock };
  let reports: {
    buildOrderWhere: jest.Mock;
    salesSummary: jest.Mock;
    brandDemand: jest.Mock;
    outletDemand: jest.Mock;
    topProducts: jest.Mock;
    weekdayDistribution: jest.Mock;
    peakAndSlowHours: jest.Mock;
    promotionRecommendations: jest.Mock;
  };

  const weekday = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    orderCount: dayOfWeek === 3 ? 50 : 10,
    revenue: D("0"),
    averageOrderValue: D("0"),
  }));

  beforeEach(async () => {
    prisma = {
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      outlet: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { groupBy: jest.fn().mockResolvedValue([]) },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    costing = { computeVariantCost: jest.fn() };
    kitchens = { list: jest.fn().mockResolvedValue([]) };
    loyalty = { getPointsLiability: jest.fn().mockResolvedValue({ totalPoints: 0, redemptionRatio: D("0.1"), estimatedLiability: D("0") }) };
    campaigns = { list: jest.fn().mockResolvedValue([]), getStats: jest.fn() };
    forecasting = { forecastAllIngredients: jest.fn().mockResolvedValue([]) };
    recommendations = {
      discountCandidates: jest.fn().mockResolvedValue([]),
      comboPromotionCandidates: jest.fn().mockResolvedValue([]),
      segmentTargetingCandidates: jest.fn().mockResolvedValue([]),
    };
    reports = {
      buildOrderWhere: jest.fn().mockReturnValue({ organizationId: "org_1", status: "PAID" }),
      salesSummary: jest.fn().mockResolvedValue({ orderCount: 0, subtotal: D("0"), taxTotal: D("0"), discountAmount: D("0"), total: D("1000"), averageOrderValue: D("0") }),
      brandDemand: jest.fn().mockResolvedValue([]),
      outletDemand: jest.fn().mockResolvedValue([]),
      topProducts: jest.fn().mockResolvedValue([]),
      weekdayDistribution: jest.fn().mockResolvedValue(weekday),
      peakAndSlowHours: jest.fn().mockResolvedValue({ peakHour: null, slowHour: null }),
      promotionRecommendations: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        GrowthDashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: CostingService, useValue: costing },
        { provide: KitchensService, useValue: kitchens },
        { provide: LoyaltyService, useValue: loyalty },
        { provide: CampaignsService, useValue: campaigns },
        { provide: ForecastingService, useValue: forecasting },
        { provide: PromotionRecommendationsService, useValue: recommendations },
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = module.get(GrowthDashboardService);
  });

  it("nets total contribution as revenue minus resolved COGS", async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      { variantId: "v_1", quantity: 2, lineSubtotal: D("200"), order: { outletId: "out_1" } },
    ]);
    prisma.productVariant.findMany.mockResolvedValue([{ id: "v_1", kind: "RETAIL_COMMODITY", landedCost: D("30"), purchasePrice: null }]);

    const result = await service.getDashboard("org_1", {});

    // Revenue 1000 - COGS (30 * 2 = 60) = 940.
    expect(result.totalContribution.toString()).toBe("940");
  });

  it("rolls up outlet expenses to brand profitability but excludes org-wide (outletId null) expenses", async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      { variantId: "v_1", quantity: 1, lineSubtotal: D("100"), order: { outletId: "out_1" } },
    ]);
    prisma.productVariant.findMany.mockResolvedValue([{ id: "v_1", kind: "RETAIL_COMMODITY", landedCost: D("10"), purchasePrice: null }]);
    prisma.outlet.findMany.mockResolvedValue([{ id: "out_1", brandId: "brand_1" }]);
    prisma.expense.groupBy.mockResolvedValue([
      { outletId: "out_1", _sum: { amount: D("5") } },
      { outletId: null, _sum: { amount: D("1000") } }, // org-wide — must not be attributed to brand_1.
    ]);
    reports.outletDemand.mockResolvedValue([{ outletId: "out_1", outletName: "Main", orderCount: 1, revenue: D("100"), averageOrderValue: D("100") }]);
    reports.brandDemand.mockResolvedValue([{ brandId: "brand_1", brandName: "Brand", orderCount: 1, revenue: D("100"), averageOrderValue: D("100") }]);

    const result = await service.getDashboard("org_1", {});

    expect(result.outletProfitability).toEqual([
      expect.objectContaining({ outletId: "out_1", cogs: D("10"), expenses: D("5"), profit: D("85") }),
    ]);
    // profit = revenue(100) - cogs(10) - expenses(5) = 85; the 1000 org-wide expense never applies here.
    expect(result.brandProfitability).toEqual([
      expect.objectContaining({ brandId: "brand_1", cogs: D("10"), expenses: D("5"), profit: D("85") }),
    ]);
  });

  it("computes the customer repeat rate from orders grouped by customer", async () => {
    prisma.order.groupBy.mockResolvedValue([
      { customerId: "c_1", _count: { _all: 3 } },
      { customerId: "c_2", _count: { _all: 1 } },
      { customerId: "c_3", _count: { _all: 2 } },
    ]);

    const result = await service.getDashboard("org_1", {});

    expect(result.customerRepeatRate).toEqual({ totalCustomers: 3, repeatCustomers: 2, repeatRatePercent: 66.67 });
  });

  it("computes WhatsApp campaign ROI from attributed revenue minus message cost, and reports SMS as having no data source", async () => {
    campaigns.list.mockResolvedValue([{ id: "camp_1", costPerMessage: D("0.5") }]);
    campaigns.getStats.mockResolvedValue({ targeted: 100, sent: 100, delivered: 100, failed: 0, skipped: 0, converted: 10, conversionRate: 10, revenueAttributed: D("200") });

    const result = await service.getDashboard("org_1", {});

    // cost = 0.5 * 100 = 50; roi = (200 - 50) / 50 * 100 = 300%.
    expect(result.campaignROI.whatsapp.revenue.toString()).toBe("200");
    expect(result.campaignROI.whatsapp.cost.toString()).toBe("50");
    expect(result.campaignROI.whatsapp.roiPercent?.toString()).toBe("300");
    expect(result.campaignROI.sms.roiPercent).toBeNull();
    expect(result.campaignROI.sms.note).toMatch(/WhatsApp-only/);
  });

  it("picks the day of week with the highest order count as the best sales day", async () => {
    const result = await service.getDashboard("org_1", {});
    expect(result.bestSalesDay.dayOfWeek).toBe(3);
    expect(result.bestSalesDay.orderCount).toBe(50);
  });

  it("loops across every kitchen for stockout risk and purchase recommendations when no kitchenId is given", async () => {
    kitchens.list.mockResolvedValue([{ id: "k_1" }, { id: "k_2" }]);
    forecasting.forecastAllIngredients.mockImplementation(async (_org: string, kitchenId: string) => [
      { ingredientId: `ing_${kitchenId}`, stockoutRisk: kitchenId === "k_1" ? "HIGH" : "LOW", reorderRecommended: kitchenId === "k_2" },
    ]);

    const result = await service.getDashboard("org_1", {});

    expect(forecasting.forecastAllIngredients).toHaveBeenCalledWith("org_1", "k_1", 14);
    expect(forecasting.forecastAllIngredients).toHaveBeenCalledWith("org_1", "k_2", 14);
    expect(result.stockoutRisks).toEqual([{ ingredientId: "ing_k_1", stockoutRisk: "HIGH", reorderRecommended: false }]);
    expect(result.purchaseRecommendations).toEqual([{ ingredientId: "ing_k_2", stockoutRisk: "LOW", reorderRecommended: true }]);
  });

  it("scopes stockout risk and purchase recommendations to a single kitchen when kitchenId is given", async () => {
    forecasting.forecastAllIngredients.mockResolvedValue([]);

    await service.getDashboard("org_1", { kitchenId: "k_specific" });

    expect(kitchens.list).not.toHaveBeenCalled();
    expect(forecasting.forecastAllIngredients).toHaveBeenCalledWith("org_1", "k_specific", 14);
    expect(forecasting.forecastAllIngredients).toHaveBeenCalledTimes(1);
  });
});
