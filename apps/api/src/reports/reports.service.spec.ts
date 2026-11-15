import { Test } from "@nestjs/testing";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { ReportsService } from "./reports.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("ReportsService", () => {
  let service: ReportsService;
  let costing: { computeVariantCost: jest.Mock };
  let prisma: {
    order: { aggregate: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    orderItem: { groupBy: jest.Mock };
    productVariant: { findMany: jest.Mock };
    combo: { findMany: jest.Mock };
    outlet: { findMany: jest.Mock };
    payment: { groupBy: jest.Mock };
    promotionRedemption: { groupBy: jest.Mock };
    promotion: { findMany: jest.Mock };
    expense: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      order: { aggregate: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      orderItem: { groupBy: jest.fn() },
      productVariant: { findMany: jest.fn() },
      combo: { findMany: jest.fn() },
      outlet: { findMany: jest.fn() },
      payment: { groupBy: jest.fn() },
      promotionRedemption: { groupBy: jest.fn() },
      promotion: { findMany: jest.fn() },
      expense: { aggregate: jest.fn() },
    };
    costing = { computeVariantCost: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CostingService, useValue: costing },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  it("salesSummary() scopes to PAID orders in the caller's organization and applies filters", async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { subtotal: D("1000"), taxTotal: D("50"), discountAmount: D("30"), total: D("1020") },
    });

    const result = await service.salesSummary("org_1", { outletId: "outlet_1" });

    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1", status: "PAID", outletId: "outlet_1" },
      }),
    );
    expect(result.orderCount).toBe(2);
    expect(result.averageOrderValue.toString()).toBe("510");
  });

  it("salesSummary() reports a zero average when there are no orders", async () => {
    prisma.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: {} });
    const result = await service.salesSummary("org_1", {});
    expect(result.orderCount).toBe(0);
    expect(result.total.toString()).toBe("0");
    expect(result.averageOrderValue.toString()).toBe("0");
  });

  it("salesSummary() filters by a half-open date range on closedAt", async () => {
    prisma.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: {} });
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-02-01T00:00:00.000Z");

    await service.salesSummary("org_1", { from, to });

    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ closedAt: { gte: from, lt: to } }),
      }),
    );
  });

  it("salesByDay() groups PAID order totals by calendar day", async () => {
    prisma.order.findMany.mockResolvedValue([
      { closedAt: new Date("2026-01-01T10:00:00.000Z"), total: D("100") },
      { closedAt: new Date("2026-01-01T18:00:00.000Z"), total: D("50") },
      { closedAt: new Date("2026-01-02T09:00:00.000Z"), total: D("75") },
    ]);

    const result = await service.salesByDay("org_1", {});

    expect(result).toEqual([
      { date: "2026-01-01", total: D("150") },
      { date: "2026-01-02", total: D("75") },
    ]);
  });

  it("topProducts() ranks by revenue and resolves variant/product names", async () => {
    prisma.orderItem.groupBy.mockResolvedValue([
      { variantId: "v1", _sum: { quantity: 10, lineSubtotal: D("500") } },
      { variantId: "v2", _sum: { quantity: 3, lineSubtotal: D("90") } },
    ]);
    prisma.productVariant.findMany.mockResolvedValue([
      { id: "v1", name: "Regular", product: { name: "Filter Coffee" } },
      { id: "v2", name: "Small", product: { name: "Margherita" } },
    ]);

    const result = await service.topProducts("org_1", {});

    expect(result).toEqual([
      { variantId: "v1", productName: "Filter Coffee", variantName: "Regular", quantitySold: 10, revenue: D("500") },
      { variantId: "v2", productName: "Margherita", variantName: "Small", quantitySold: 3, revenue: D("90") },
    ]);
    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("topProducts() passes through a custom limit", async () => {
    prisma.orderItem.groupBy.mockResolvedValue([]);
    prisma.productVariant.findMany.mockResolvedValue([]);
    await service.topProducts("org_1", { limit: 5 });
    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });

  it("comboPerformance() counts combo instances sold (not component line rows) and sums their revenue", async () => {
    // Two instances of combo_1 (2 component lines each) and one instance of combo_2.
    prisma.orderItem.groupBy.mockResolvedValue([
      { comboId: "combo_1", comboInstanceId: "inst_1", _sum: { lineSubtotal: D("430") } },
      { comboId: "combo_1", comboInstanceId: "inst_2", _sum: { lineSubtotal: D("430") } },
      { comboId: "combo_2", comboInstanceId: "inst_3", _sum: { lineSubtotal: D("200") } },
    ]);
    prisma.combo.findMany.mockResolvedValue([
      { id: "combo_1", name: "Pizza Combo" },
      { id: "combo_2", name: "Snack Combo" },
    ]);

    const result = await service.comboPerformance("org_1", {});

    expect(result).toEqual([
      { comboId: "combo_1", name: "Pizza Combo", instancesSold: 2, revenue: D("860") },
      { comboId: "combo_2", name: "Snack Combo", instancesSold: 1, revenue: D("200") },
    ]);
  });

  it("profitLoss() subtracts expenses from revenue over the same filtered window", async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: D("1000") } });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: D("400") } });

    const result = await service.profitLoss("org_1", {});

    expect(result).toEqual({ revenue: D("1000"), expenses: D("400"), netProfit: D("600") });
    expect(prisma.expense.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org_1" } }),
    );
  });

  it("profitLoss() reports a zero P&L when there's no revenue or expenses at all", async () => {
    prisma.order.aggregate.mockResolvedValue({ _sum: {} });
    prisma.expense.aggregate.mockResolvedValue({ _sum: {} });
    const result = await service.profitLoss("org_1", {});
    expect(result).toEqual({ revenue: D("0"), expenses: D("0"), netProfit: D("0") });
  });

  it("paymentMethods() sums amounts and counts per method", async () => {
    prisma.payment.groupBy.mockResolvedValue([
      { method: "CASH", _sum: { amount: D("300") }, _count: { _all: 3 } },
      { method: "CARD", _sum: { amount: D("150") }, _count: { _all: 1 } },
    ]);
    const result = await service.paymentMethods("org_1", {});
    expect(result).toEqual([
      { method: "CASH", count: 3, amount: D("300") },
      { method: "CARD", count: 1, amount: D("150") },
    ]);
  });

  it("promotionUsage() resolves promotion codes and totals discount given", async () => {
    prisma.promotionRedemption.groupBy.mockResolvedValue([
      { promotionId: "promo_1", _sum: { discountAmount: D("150") }, _count: { _all: 5 } },
    ]);
    prisma.promotion.findMany.mockResolvedValue([{ id: "promo_1", code: "WELCOME10" }]);

    const result = await service.promotionUsage("org_1", {});

    expect(result).toEqual([{ promotionId: "promo_1", code: "WELCOME10", redemptions: 5, totalDiscount: D("150") }]);
  });

  describe("weekdayDistribution", () => {
    it("groups PAID orders by UTC day of week and fills every day, even ones with no orders", async () => {
      prisma.order.findMany.mockResolvedValue([
        { closedAt: new Date("2026-01-04T10:00:00.000Z"), total: D("100") }, // Sunday
        { closedAt: new Date("2026-01-04T18:00:00.000Z"), total: D("50") }, // Sunday
        { closedAt: new Date("2026-01-05T09:00:00.000Z"), total: D("75") }, // Monday
      ]);

      const result = await service.weekdayDistribution("org_1", {});

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ dayOfWeek: 0, orderCount: 2, revenue: D("150"), averageOrderValue: D("75") });
      expect(result[1]).toEqual({ dayOfWeek: 1, orderCount: 1, revenue: D("75"), averageOrderValue: D("75") });
      expect(result[2]).toEqual({ dayOfWeek: 2, orderCount: 0, revenue: D("0"), averageOrderValue: D("0") });
    });
  });

  describe("hourlyDistribution", () => {
    it("groups PAID orders by UTC hour and fills every hour", async () => {
      prisma.order.findMany.mockResolvedValue([
        { closedAt: new Date("2026-01-01T23:30:00.000Z"), total: D("100") },
        { closedAt: new Date("2026-01-02T23:45:00.000Z"), total: D("40") },
      ]);

      const result = await service.hourlyDistribution("org_1", {});

      expect(result).toHaveLength(24);
      expect(result[23]).toEqual({ hour: 23, orderCount: 2, revenue: D("140"), averageOrderValue: D("70") });
      expect(result[0]).toEqual({ hour: 0, orderCount: 0, revenue: D("0"), averageOrderValue: D("0") });
    });
  });

  describe("demandHeatmap", () => {
    it("returns only the weekday x hour cells that actually had an order", async () => {
      prisma.order.findMany.mockResolvedValue([
        { closedAt: new Date("2026-01-04T10:00:00.000Z"), total: D("100") }, // Sunday 10:00
        { closedAt: new Date("2026-01-04T10:30:00.000Z"), total: D("20") }, // Sunday 10:00 again
        { closedAt: new Date("2026-01-05T09:00:00.000Z"), total: D("75") }, // Monday 09:00
      ]);

      const result = await service.demandHeatmap("org_1", {});

      expect(result).toEqual([
        { dayOfWeek: 0, hour: 10, orderCount: 2, revenue: D("120") },
        { dayOfWeek: 1, hour: 9, orderCount: 1, revenue: D("75") },
      ]);
    });
  });

  describe("peakAndSlowHours", () => {
    it("picks the busiest and quietest hour among hours that had at least one order", async () => {
      prisma.order.findMany.mockResolvedValue([
        { closedAt: new Date("2026-01-04T12:00:00.000Z"), total: D("10") },
        { closedAt: new Date("2026-01-04T12:30:00.000Z"), total: D("10") },
        { closedAt: new Date("2026-01-04T12:45:00.000Z"), total: D("10") },
        { closedAt: new Date("2026-01-05T03:00:00.000Z"), total: D("5") },
      ]);

      const result = await service.peakAndSlowHours("org_1", {});

      expect(result.peakHour).toEqual({ hour: 12, orderCount: 3, revenue: D("30") });
      expect(result.slowHour).toEqual({ hour: 3, orderCount: 1, revenue: D("5") });
    });

    it("returns nulls when there are no orders at all in the window", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      const result = await service.peakAndSlowHours("org_1", {});
      expect(result).toEqual({ peakHour: null, slowHour: null });
    });
  });

  describe("monthlyTrend", () => {
    it("groups PAID order totals by calendar month", async () => {
      prisma.order.findMany.mockResolvedValue([
        { closedAt: new Date("2026-01-04T10:00:00.000Z"), total: D("100") },
        { closedAt: new Date("2026-01-20T10:00:00.000Z"), total: D("50") },
        { closedAt: new Date("2026-02-01T10:00:00.000Z"), total: D("75") },
      ]);

      const result = await service.monthlyTrend("org_1", {});

      expect(result).toEqual([
        { month: "2026-01", orderCount: 2, revenue: D("150"), averageOrderValue: D("75") },
        { month: "2026-02", orderCount: 1, revenue: D("75"), averageOrderValue: D("75") },
      ]);
    });
  });

  describe("brandDemand", () => {
    it("rolls outlet-level grouping up to each outlet's brand", async () => {
      prisma.order.groupBy.mockResolvedValue([
        { outletId: "outlet_1", _count: { _all: 3 }, _sum: { total: D("300") } },
        { outletId: "outlet_2", _count: { _all: 2 }, _sum: { total: D("100") } },
      ]);
      prisma.outlet.findMany.mockResolvedValue([
        { id: "outlet_1", brand: { id: "brand_1", name: "Pizza Paproni" } },
        { id: "outlet_2", brand: { id: "brand_1", name: "Pizza Paproni" } },
      ]);

      const result = await service.brandDemand("org_1", {});

      expect(result).toEqual([
        { brandId: "brand_1", brandName: "Pizza Paproni", orderCount: 5, revenue: D("400"), averageOrderValue: D("80") },
      ]);
    });
  });

  describe("outletDemand", () => {
    it("groups natively by outletId and resolves outlet names, ranked by revenue", async () => {
      prisma.order.groupBy.mockResolvedValue([
        { outletId: "outlet_1", _count: { _all: 2 }, _sum: { total: D("100") } },
        { outletId: "outlet_2", _count: { _all: 1 }, _sum: { total: D("200") } },
      ]);
      prisma.outlet.findMany.mockResolvedValue([
        { id: "outlet_1", name: "Indiranagar" },
        { id: "outlet_2", name: "Connaught Place" },
      ]);

      const result = await service.outletDemand("org_1", {});

      expect(result).toEqual([
        { outletId: "outlet_2", outletName: "Connaught Place", orderCount: 1, revenue: D("200"), averageOrderValue: D("200") },
        { outletId: "outlet_1", outletName: "Indiranagar", orderCount: 2, revenue: D("100"), averageOrderValue: D("50") },
      ]);
    });
  });

  describe("channelDemand", () => {
    it("groups natively by channel, ranked by revenue", async () => {
      prisma.order.groupBy.mockResolvedValue([
        { channel: "DINE_IN", _count: { _all: 2 }, _sum: { total: D("100") } },
        { channel: "DELIVERY", _count: { _all: 1 }, _sum: { total: D("200") } },
      ]);

      const result = await service.channelDemand("org_1", {});

      expect(result).toEqual([
        { channel: "DELIVERY", orderCount: 1, revenue: D("200"), averageOrderValue: D("200") },
        { channel: "DINE_IN", orderCount: 2, revenue: D("100"), averageOrderValue: D("50") },
      ]);
    });
  });

  describe("promotionRecommendations", () => {
    it("recommends a volume discount for a quiet slot that still has healthy margin", async () => {
      // One busy slot (Monday 09:00, high volume, thin margin) and one quiet slot (Sunday
      // 10:00, low volume, healthy margin) — quiet-but-healthy should recommend a discount.
      prisma.order.findMany.mockResolvedValue([
        ...Array.from({ length: 8 }, (_, i) => ({
          closedAt: new Date(`2026-01-05T09:0${i % 6}:00.000Z`),
          total: D("100"),
          items: [{ variantId: "v_thin", quantity: 1, lineSubtotal: D("100") }],
        })),
        {
          closedAt: new Date("2026-01-04T10:00:00.000Z"),
          total: D("100"),
          items: [{ variantId: "v_healthy", quantity: 1, lineSubtotal: D("100") }],
        },
      ]);
      prisma.productVariant.findMany.mockResolvedValue([
        { id: "v_thin", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
        { id: "v_healthy", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
      ]);
      costing.computeVariantCost.mockImplementation((_org: string, variantId: string) =>
        Promise.resolve({
          missingCostIngredientIds: [],
          costPerYieldUnit: variantId === "v_thin" ? D("90") : D("20"),
        }),
      );

      const result = await service.promotionRecommendations("org_1", {});

      expect(result).toHaveLength(1);
      expect(result[0]!.dayOfWeek).toBe(0);
      expect(result[0]!.hour).toBe(10);
      expect(result[0]!.suggestion).toMatch(/volume-driving discount/);
    });

    it("recommends a bundle upsell instead of a discount for a quiet slot with thin margin", async () => {
      prisma.order.findMany.mockResolvedValue([
        ...Array.from({ length: 8 }, (_, i) => ({
          closedAt: new Date(`2026-01-05T09:0${i % 6}:00.000Z`),
          total: D("100"),
          items: [{ variantId: "v_healthy", quantity: 1, lineSubtotal: D("100") }],
        })),
        {
          closedAt: new Date("2026-01-04T10:00:00.000Z"),
          total: D("100"),
          items: [{ variantId: "v_thin", quantity: 1, lineSubtotal: D("100") }],
        },
      ]);
      prisma.productVariant.findMany.mockResolvedValue([
        { id: "v_thin", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
        { id: "v_healthy", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
      ]);
      costing.computeVariantCost.mockImplementation((_org: string, variantId: string) =>
        Promise.resolve({
          missingCostIngredientIds: [],
          costPerYieldUnit: variantId === "v_thin" ? D("90") : D("20"),
        }),
      );

      const result = await service.promotionRecommendations("org_1", {});

      expect(result).toHaveLength(1);
      expect(result[0]!.suggestion).toMatch(/bundle upsell/);
    });

    it("treats an item with no determinable cost as full-revenue contribution rather than failing", async () => {
      prisma.order.findMany.mockResolvedValue([
        ...Array.from({ length: 8 }, (_, i) => ({
          closedAt: new Date(`2026-01-05T09:0${i % 6}:00.000Z`),
          total: D("100"),
          items: [{ variantId: "v_known", quantity: 1, lineSubtotal: D("100") }],
        })),
        {
          closedAt: new Date("2026-01-04T10:00:00.000Z"),
          total: D("100"),
          items: [{ variantId: "v_unknown", quantity: 1, lineSubtotal: D("100") }],
        },
      ]);
      prisma.productVariant.findMany.mockResolvedValue([
        { id: "v_known", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
        { id: "v_unknown", kind: "PREPARED_FOOD", landedCost: null, purchasePrice: null },
      ]);
      costing.computeVariantCost.mockImplementation((_org: string, variantId: string) =>
        variantId === "v_unknown"
          ? Promise.reject(new Error("Recipe not found for this variant"))
          : Promise.resolve({ missingCostIngredientIds: [], costPerYieldUnit: D("50") }),
      );

      const result = await service.promotionRecommendations("org_1", {});

      expect(result).toHaveLength(1);
      expect(result[0]!.estimatedContribution.toString()).toBe("100"); // full revenue — cost unknown.
    });

    it("returns an empty list when there are no orders in the window", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      const result = await service.promotionRecommendations("org_1", {});
      expect(result).toEqual([]);
    });
  });
});
