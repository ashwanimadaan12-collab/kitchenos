import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { PricingRulesService } from "./pricing-rules.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("PricingRulesService", () => {
  let service: PricingRulesService;
  let costing: { computeVariantCost: jest.Mock };
  let prisma: {
    productVariant: { findFirst: jest.Mock };
    outlet: { findFirst: jest.Mock };
    outletProductPrice: { findFirst: jest.Mock };
    pricingRule: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    pricingSettings: { findUnique: jest.Mock; create: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
  };

  const baseVariant = { id: "v1", kind: "PREPARED_FOOD", basePrice: D("100"), printedMRP: null, purchasePrice: null, landedCost: null };
  const outlet = { id: "outlet_1", organizationId: "org_1" };

  beforeEach(async () => {
    prisma = {
      productVariant: { findFirst: jest.fn() },
      outlet: { findFirst: jest.fn() },
      outletProductPrice: { findFirst: jest.fn().mockResolvedValue(null) },
      pricingRule: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      pricingSettings: {
        findUnique: jest.fn().mockResolvedValue({ minimumMarginPercent: D("0") }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    costing = { computeVariantCost: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        PricingRulesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CostingService, useValue: costing },
      ],
    }).compile();
    service = module.get(PricingRulesService);
  });

  describe("createRule", () => {
    it("404s when the variant belongs to another organization", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(
        service.createRule("org_1", {
          variantId: "v_other_org",
          category: "CHANNEL",
          label: "x",
          daysOfWeek: [],
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("10") as never,
          priority: 0,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it("404s when the outlet belongs to another organization", async () => {
      prisma.outlet.findFirst.mockResolvedValue(null);
      await expect(
        service.createRule("org_1", {
          outletId: "outlet_other_org",
          category: "OUTLET",
          label: "x",
          daysOfWeek: [],
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("10") as never,
          priority: 0,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });

    describe("margin safeguard (Prompt 19)", () => {
      it("rejects a discount that would price the variant below the minimum profitable price", async () => {
        prisma.productVariant.findFirst.mockResolvedValue(baseVariant); // basePrice 100
        prisma.pricingSettings.findUnique.mockResolvedValue({ minimumMarginPercent: D("20") });
        costing.computeVariantCost.mockResolvedValue({ missingCostIngredientIds: [], costPerYieldUnit: D("90") });
        // Floor = 90 / (1 - 0.20) = 112.5. A flat discount of 20 prices it at 80, well below that.

        await expect(
          service.createRule("org_1", {
            variantId: "v1",
            category: "SCHEDULED_DISCOUNT",
            label: "Too deep",
            daysOfWeek: [],
            adjustmentType: "FLAT_DISCOUNT",
            adjustmentValue: "20" as never,
            priority: 0,
          } as never),
        ).rejects.toThrow(ConflictException);
        expect(prisma.pricingRule.create).not.toHaveBeenCalled();
      });

      it("allows the same discount once approvedOverride is set", async () => {
        prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
        prisma.pricingSettings.findUnique.mockResolvedValue({ minimumMarginPercent: D("20") });
        costing.computeVariantCost.mockResolvedValue({ missingCostIngredientIds: [], costPerYieldUnit: D("90") });
        prisma.pricingRule.create.mockResolvedValue({ id: "rule_1" });

        const result = await service.createRule("org_1", {
          variantId: "v1",
          category: "SCHEDULED_DISCOUNT",
          label: "Too deep, approved",
          daysOfWeek: [],
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: "20" as never,
          priority: 0,
          approvedOverride: true,
        } as never);

        expect(result).toEqual({ id: "rule_1" });
        expect(prisma.pricingRule.create).toHaveBeenCalled();
      });

      it("never blocks a discount when cost can't be determined", async () => {
        prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
        prisma.pricingSettings.findUnique.mockResolvedValue({ minimumMarginPercent: D("20") });
        costing.computeVariantCost.mockRejectedValue(new Error("Recipe not found for this variant"));
        prisma.pricingRule.create.mockResolvedValue({ id: "rule_1" });

        await expect(
          service.createRule("org_1", {
            variantId: "v1",
            category: "SCHEDULED_DISCOUNT",
            label: "Unmeasured",
            daysOfWeek: [],
            adjustmentType: "FLAT_DISCOUNT",
            adjustmentValue: "90" as never,
            priority: 0,
          } as never),
        ).resolves.toEqual({ id: "rule_1" });
      });
    });
  });

  describe("quote", () => {
    it("returns the plain base price with no rule when nothing matches", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.finalPrice.toString()).toBe("100");
      expect(result.selectedRule).toBeNull();
    });

    it("resolves from the outlet override before applying any rule", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.outletProductPrice.findFirst.mockResolvedValue({ price: D("120") });

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.finalPrice.toString()).toBe("120");
      expect(result.breakdown.outletOverride?.toString()).toBe("120");
    });

    it("applies a matching FLAT_DISCOUNT rule on top of the resolved base", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "rule_1",
          label: "Flat 10 off",
          category: "SCHEDULED_DISCOUNT",
          variantId: null,
          outletId: null,
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("10"),
          priority: 0,
          createdAt: new Date("2026-01-01"),
        },
      ]);

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.finalPrice.toString()).toBe("90");
      expect(result.selectedRule?.id).toBe("rule_1");
    });

    it("picks the more specific of two otherwise-matching rules", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "generic",
          label: "Generic 10% off",
          category: "SCHEDULED_DISCOUNT",
          variantId: null,
          outletId: null,
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "PERCENT_DISCOUNT",
          adjustmentValue: D("10"),
          priority: 0,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "specific",
          label: "Outlet-specific 20% off",
          category: "OUTLET",
          variantId: null,
          outletId: "outlet_1",
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "PERCENT_DISCOUNT",
          adjustmentValue: D("20"),
          priority: 0,
          createdAt: new Date("2026-01-02"),
        },
      ]);

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.selectedRule?.id).toBe("specific");
      expect(result.finalPrice.toString()).toBe("80");
    });

    it("does not match a rule scoped to a different outlet or channel", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "wrong_outlet",
          label: "x",
          category: "OUTLET",
          variantId: null,
          outletId: "outlet_2",
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("50"),
          priority: 0,
          createdAt: new Date(),
        },
        {
          id: "wrong_channel",
          label: "y",
          category: "CHANNEL",
          variantId: null,
          outletId: null,
          channel: "DELIVERY",
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("50"),
          priority: 0,
          createdAt: new Date(),
        },
      ]);

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.selectedRule).toBeNull();
      expect(result.finalPrice.toString()).toBe("100");
    });

    it("matches an overnight time window that wraps midnight", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant);
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "midnight",
          label: "Midnight discount",
          category: "TIME_BASED",
          variantId: null,
          outletId: null,
          channel: null,
          daysOfWeek: [],
          startTime: "22:00",
          endTime: "02:00",
          validFrom: null,
          validTo: null,
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("15"),
          priority: 0,
          createdAt: new Date(),
        },
      ]);

      const insideWindow = await service.quote("org_1", {
        variantId: "v1",
        outletId: "outlet_1",
        channel: "DINE_IN",
        at: new Date("2026-01-05T23:30:00Z"),
      });
      expect(insideWindow.selectedRule?.id).toBe("midnight");

      const outsideWindow = await service.quote("org_1", {
        variantId: "v1",
        outletId: "outlet_1",
        channel: "DINE_IN",
        at: new Date("2026-01-05T12:00:00Z"),
      });
      expect(outsideWindow.selectedRule).toBeNull();
    });

    it("never quotes above a retail commodity's printed MRP, even after a surcharge rule", async () => {
      prisma.productVariant.findFirst.mockResolvedValue({
        ...baseVariant,
        kind: "RETAIL_COMMODITY",
        printedMRP: D("105"),
        landedCost: D("70"),
      });
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "surcharge",
          label: "Festival surcharge",
          category: "FESTIVAL",
          variantId: null,
          outletId: null,
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "PERCENT_SURCHARGE",
          adjustmentValue: D("50"), // 100 -> 150, which must be capped at MRP 105
          priority: 0,
          createdAt: new Date(),
        },
      ]);

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.finalPrice.toString()).toBe("105");
      expect(result.breakdown.mrpCapped).toBe(true);
    });

    it("raises the final price to the configured minimum-margin floor when cost is known", async () => {
      prisma.productVariant.findFirst.mockResolvedValue({
        ...baseVariant,
        kind: "RETAIL_COMMODITY",
        landedCost: D("90"),
      });
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingRule.findMany.mockResolvedValue([
        {
          id: "deep_discount",
          label: "Deep discount",
          category: "SCHEDULED_DISCOUNT",
          variantId: null,
          outletId: null,
          channel: null,
          daysOfWeek: [],
          startTime: null,
          endTime: null,
          validFrom: null,
          validTo: null,
          adjustmentType: "FLAT_DISCOUNT",
          adjustmentValue: D("95"), // 100 -> 5, far below cost
          priority: 0,
          createdAt: new Date(),
        },
      ]);
      prisma.pricingSettings.findUnique.mockResolvedValue({ minimumMarginPercent: D("10") });

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      // floor = cost / (1 - margin) = 90 / 0.9 = 100
      expect(result.finalPrice.toString()).toBe("100");
      expect(result.breakdown.marginFloorApplied).toBe(true);
    });

    it("skips the margin floor when cost cannot be determined (no recipe costed yet)", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(baseVariant); // PREPARED_FOOD
      prisma.outlet.findFirst.mockResolvedValue(outlet);
      prisma.pricingSettings.findUnique.mockResolvedValue({ minimumMarginPercent: D("50") });
      costing.computeVariantCost.mockRejectedValue(new NotFoundException("Recipe not found for this variant"));

      const result = await service.quote("org_1", { variantId: "v1", outletId: "outlet_1", channel: "DINE_IN" });

      expect(result.finalPrice.toString()).toBe("100");
      expect(result.breakdown.cost).toBeNull();
      expect(result.breakdown.marginFloorApplied).toBe(false);
    });
  });

  describe("getSettings", () => {
    it("creates default settings on first read", async () => {
      prisma.pricingSettings.findUnique.mockResolvedValue(null);
      prisma.pricingSettings.create.mockResolvedValue({ organizationId: "org_1", minimumMarginPercent: D("0") });

      const settings = await service.getSettings("org_1");

      expect(settings.minimumMarginPercent.toString()).toBe("0");
      expect(prisma.pricingSettings.create).toHaveBeenCalledWith({ data: { organizationId: "org_1" } });
    });
  });
});
