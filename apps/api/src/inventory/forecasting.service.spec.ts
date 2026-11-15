import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { ForecastingService } from "./forecasting.service.js";

const D = (v: string) => new Prisma.Decimal(v);
const DAY_MS = 24 * 60 * 60 * 1000;

describe("ForecastingService", () => {
  let service: ForecastingService;
  let prisma: {
    kitchen: { findFirst: jest.Mock };
    ingredient: { findFirst: jest.Mock; findMany: jest.Mock };
    stockBalance: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    stockMovement: { findMany: jest.Mock };
    purchaseOrderItem: { findMany: jest.Mock };
    promotion: { findFirst: jest.Mock };
    campaign: { findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    outlet: { findFirst: jest.Mock };
    orderItem: { findMany: jest.Mock };
  };

  // Pinned "now" so lookback/trend-window/weekday math is fully deterministic.
  const NOW = new Date("2026-01-15T12:00:00.000Z"); // Thursday.

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = {
      kitchen: { findFirst: jest.fn() },
      ingredient: { findFirst: jest.fn(), findMany: jest.fn() },
      stockBalance: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
      stockMovement: { findMany: jest.fn() },
      purchaseOrderItem: { findMany: jest.fn() },
      promotion: { findFirst: jest.fn().mockResolvedValue(null) },
      campaign: { findFirst: jest.fn().mockResolvedValue(null) },
      productVariant: { findFirst: jest.fn() },
      outlet: { findFirst: jest.fn() },
      orderItem: { findMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ForecastingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ForecastingService);
    prisma.purchaseOrderItem.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** One CONSUMPTION movement per day for `days` days ending today, each of `quantityPerDay`. */
  function flatConsumptionHistory(quantityPerDay: string, days: number) {
    return Array.from({ length: days }, (_, i) => ({
      createdAt: new Date(NOW.getTime() - i * DAY_MS),
      quantityDelta: D(quantityPerDay).neg(),
    }));
  }

  const kitchen = { id: "kitchen_1", organizationId: "org_1" };
  const ingredientNoSupplier = { id: "ing_1", name: "Milk", shelfLifeDays: null, preferredSupplier: null };

  describe("forecastIngredient", () => {
    it("404s for a kitchen from another organization", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(null);
      await expect(service.forecastIngredient("org_1", "kitchen_from_org_2", "ing_1", 14)).rejects.toThrow(NotFoundException);
    });

    it("404s for an ingredient from another organization", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(null);
      await expect(service.forecastIngredient("org_1", "kitchen_1", "ing_from_org_2", 14)).rejects.toThrow(NotFoundException);
    });

    it("projects flat historical demand forward with no weekday/trend adjustment", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("500"),
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.averageDailyDemand.toString()).toBe("10");
      expect(result.forecastDemand.toString()).toBe("140"); // 10/day x 14 days, flat series -> trend/weekday both neutral.
      expect(result.trendFactor).toBe(1);
      expect(result.leadTimeSource).toBe("default");
      expect(result.leadTimeDays).toBe(3);
    });

    it("resolves lead time from the ingredient's preferred supplier when no override is set", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: "ing_1",
        name: "Milk",
        shelfLifeDays: null,
        preferredSupplier: { leadTimeDays: 7 },
      });
      prisma.stockBalance.findUnique.mockResolvedValue(null);
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.leadTimeDays).toBe(7);
      expect(result.leadTimeSource).toBe("preferred_supplier");
    });

    it("a manual lead-time override wins over the preferred supplier's lead time", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue({
        id: "ing_1",
        name: "Milk",
        shelfLifeDays: null,
        preferredSupplier: { leadTimeDays: 7 },
      });
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("0"),
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: 1,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.leadTimeDays).toBe(1);
      expect(result.leadTimeSource).toBe("override");
    });

    it("a manual safety-stock override wins over the computed value", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("0"),
        reorderPoint: null,
        safetyStockOverride: D("42"),
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.safetyStock.toString()).toBe("42");
      expect(result.safetyStockSource).toBe("override");
    });

    it("a manually-set reorder point wins over the recommended one for triggering reorderRecommended", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      // Flat demand of 10/day, lead time 3 -> recommended reorder point ~= 30 + safety stock.
      // Stock on hand of 25 is below that recommendation, but a manual reorder point of 10 is not.
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("25"),
        reorderPoint: D("10"),
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.reorderPointSource).toBe("manual");
      expect(result.reorderPoint.toString()).toBe("10");
      expect(result.reorderRecommended).toBe(false);
    });

    it("flags HIGH stockout risk when days of stock remaining is less than the lead time", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("10"), // 1 day of stock at 10/day demand.
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.daysOfStockRemaining).toBeCloseTo(1, 5);
      expect(result.stockoutRisk).toBe("HIGH");
    });

    it("reports NONE stockout risk and skips excess/expiry flags when there's no recent demand", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("1000"),
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue([]);

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.daysOfStockRemaining).toBeNull();
      expect(result.stockoutRisk).toBe("NONE");
      expect(result.excessInventory).toBe(false);
    });

    it("flags excess inventory when stock on hand would last well beyond the excess threshold", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("10000"), // 1000 days of stock at 10/day.
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.excessInventory).toBe(true);
    });

    it("flags expiry risk when stock on hand would outlast the ingredient's shelf life", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue({ id: "ing_1", name: "Milk", shelfLifeDays: 5, preferredSupplier: null });
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("100"), // 10 days of stock at 10/day -> outlasts a 5-day shelf life.
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.expiryRisk).toBe(true);
    });

    it("applies a promotion uplift to the forecast when a running campaign exists", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("500"),
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));
      prisma.campaign.findFirst.mockResolvedValue({ id: "camp_1" });

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.promotionUpliftApplied).toBe(true);
      expect(result.forecastDemand.toString()).toBe("154"); // 140 x 1.1.
    });

    it("counts outstanding purchase order quantities toward incoming stock", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.findUnique.mockResolvedValue({
        quantityOnHand: D("0"),
        reorderPoint: null,
        safetyStockOverride: null,
        leadTimeDaysOverride: null,
      });
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: D("50"), quantityReceived: D("20") }]);

      const result = await service.forecastIngredient("org_1", "kitchen_1", "ing_1", 14);

      expect(result.incomingQuantity.toString()).toBe("30");
    });
  });

  describe("forecastAllIngredients", () => {
    it("sorts by stockout risk severity, worst first", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findMany.mockResolvedValue([
        { id: "ing_safe", name: "Flour", shelfLifeDays: null, preferredSupplier: null },
        { id: "ing_risky", name: "Milk", shelfLifeDays: null, preferredSupplier: null },
      ]);
      prisma.stockBalance.findMany.mockResolvedValue([
        { ingredientId: "ing_safe", quantityOnHand: D("1000"), reorderPoint: null, safetyStockOverride: null, leadTimeDaysOverride: null },
        { ingredientId: "ing_risky", quantityOnHand: D("10"), reorderPoint: null, safetyStockOverride: null, leadTimeDaysOverride: null },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue(flatConsumptionHistory("10", 84));

      const result = await service.forecastAllIngredients("org_1", "kitchen_1", 14);

      expect(result).toHaveLength(2);
      expect(result[0]!.ingredientId).toBe("ing_risky");
      expect(result[0]!.stockoutRisk).toBe("HIGH");
      expect(result[1]!.ingredientId).toBe("ing_safe");
    });
  });

  describe("forecastProductDemand", () => {
    it("404s for a variant from another organization", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.forecastProductDemand("org_1", "variant_from_org_2", undefined, 14)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("projects flat historical order quantity forward", async () => {
      prisma.productVariant.findFirst.mockResolvedValue({
        id: "variant_1",
        name: "Medium",
        product: { name: "Margherita" },
      });
      prisma.orderItem.findMany.mockResolvedValue(
        Array.from({ length: 84 }, (_, i) => ({
          quantity: 5,
          order: { closedAt: new Date(NOW.getTime() - i * DAY_MS) },
        })),
      );

      const result = await service.forecastProductDemand("org_1", "variant_1", undefined, 7);

      expect(result.averageDailyDemand.toString()).toBe("5");
      expect(result.forecastQuantity.toString()).toBe("35"); // 5/day x 7 days.
    });
  });

  describe("setForecastOverride", () => {
    it("404s for a kitchen from another organization", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(null);
      await expect(
        service.setForecastOverride("org_1", "kitchen_from_org_2", "ing_1", { safetyStockOverride: "5" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("upserts the override onto the kitchen's stock balance", async () => {
      prisma.kitchen.findFirst.mockResolvedValue(kitchen);
      prisma.ingredient.findFirst.mockResolvedValue(ingredientNoSupplier);
      prisma.stockBalance.upsert.mockResolvedValue({ id: "bal_1" });

      const result = await service.setForecastOverride("org_1", "kitchen_1", "ing_1", {
        safetyStockOverride: "25",
        leadTimeDaysOverride: 5,
      });

      expect(result).toEqual({ id: "bal_1" });
      expect(prisma.stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { safetyStockOverride: "25", leadTimeDaysOverride: 5 },
        }),
      );
    });
  });
});
