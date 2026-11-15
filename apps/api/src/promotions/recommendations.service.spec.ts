import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { PricingRulesService } from "../pricing/pricing-rules.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { SegmentsService } from "../campaigns/segments.service.js";
import { PromotionRecommendationsService } from "./recommendations.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("PromotionRecommendationsService", () => {
  let service: PromotionRecommendationsService;
  let costing: { computeVariantCost: jest.Mock };
  let pricingRules: { getSettings: jest.Mock };
  let campaigns: { list: jest.Mock; getStats: jest.Mock };
  let segments: { list: jest.Mock; resolveCustomerIds: jest.Mock };
  let prisma: {
    productVariant: { findMany: jest.Mock; findFirst: jest.Mock };
    orderItem: { groupBy: jest.Mock };
    combo: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      productVariant: { findMany: jest.fn(), findFirst: jest.fn() },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      combo: { findMany: jest.fn().mockResolvedValue([]) },
    };
    costing = { computeVariantCost: jest.fn() };
    pricingRules = { getSettings: jest.fn().mockResolvedValue({ minimumMarginPercent: D("20") }) };
    campaigns = { list: jest.fn().mockResolvedValue([]), getStats: jest.fn() };
    segments = { list: jest.fn().mockResolvedValue([]), resolveCustomerIds: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PromotionRecommendationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CostingService, useValue: costing },
        { provide: PricingRulesService, useValue: pricingRules },
        { provide: CampaignsService, useValue: campaigns },
        { provide: SegmentsService, useValue: segments },
      ],
    }).compile();
    service = module.get(PromotionRecommendationsService);
  });

  describe("discountCandidates", () => {
    it("recommends a slow-selling, healthy-margin variant, capping the discount at the margin floor", async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "v_healthy",
          name: "Large",
          kind: "PREPARED_FOOD",
          basePrice: D("100"),
          landedCost: null,
          purchasePrice: null,
          product: { name: "Pizza" },
        },
      ]);
      prisma.orderItem.groupBy.mockResolvedValue([{ variantId: "v_healthy", _sum: { quantity: 2 } }]);
      costing.computeVariantCost.mockResolvedValue({ missingCostIngredientIds: [], costPerYieldUnit: D("40") }); // 60% margin.

      const result = await service.discountCandidates("org_1");

      expect(result).toHaveLength(1);
      expect(result[0]!.variantId).toBe("v_healthy");
      expect(result[0]!.marginPercent?.toString()).toBe("60");
      // Floor = 40 / (1 - 0.20) = 50. A 15% discount would price it at 85, well above 50, so
      // the full 15% is safe to suggest as-is.
      expect(result[0]!.suggestedDiscountPercent).toBe(15);
      expect(result[0]!.minimumProfitablePrice?.toString()).toBe("50");
    });

    it("shrinks the suggested discount so it never crosses the margin floor", async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "v_thin_but_healthy",
          name: "Regular",
          kind: "PREPARED_FOOD",
          basePrice: D("100"),
          landedCost: null,
          purchasePrice: null,
          product: { name: "Snack" },
        },
      ]);
      prisma.orderItem.groupBy.mockResolvedValue([]);
      // 31% margin — just above the 30% healthy-margin threshold that qualifies it as a
      // candidate at all — but the resulting floor (86.25) sits above a naive 15% discount's
      // price (85), so the suggestion must shrink to fit, not just flag a warning.
      costing.computeVariantCost.mockResolvedValue({ missingCostIngredientIds: [], costPerYieldUnit: D("69") });

      const result = await service.discountCandidates("org_1");

      expect(result[0]!.minimumProfitablePrice?.toString()).toBe("86.25");
      expect(result[0]!.suggestedDiscountPercent).toBe(13.8); // 100 - 86.25, rounded to 1 decimal.
    });

    it("excludes a variant whose margin is below the healthy threshold", async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "v_thin",
          name: "Regular",
          kind: "PREPARED_FOOD",
          basePrice: D("100"),
          landedCost: null,
          purchasePrice: null,
          product: { name: "Snack" },
        },
      ]);
      prisma.orderItem.groupBy.mockResolvedValue([]);
      costing.computeVariantCost.mockResolvedValue({ missingCostIngredientIds: [], costPerYieldUnit: D("85") }); // 15% margin.

      const result = await service.discountCandidates("org_1");

      expect(result).toHaveLength(0);
    });

    it("excludes a variant whose cost can't be determined", async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        {
          id: "v_unknown",
          name: "Regular",
          kind: "PREPARED_FOOD",
          basePrice: D("100"),
          landedCost: null,
          purchasePrice: null,
          product: { name: "Mystery" },
        },
      ]);
      prisma.orderItem.groupBy.mockResolvedValue([]);
      costing.computeVariantCost.mockRejectedValue(new Error("Recipe not found for this variant"));

      const result = await service.discountCandidates("org_1");

      expect(result).toHaveLength(0);
    });
  });

  describe("comboPromotionCandidates", () => {
    it("ranks combos by fewest instances sold, not by revenue", async () => {
      prisma.combo.findMany.mockResolvedValue([
        { id: "combo_busy", name: "Busy Combo", comboPrice: D("300") },
        { id: "combo_quiet", name: "Quiet Combo", comboPrice: D("300") },
      ]);
      prisma.orderItem.groupBy.mockResolvedValue([
        { comboId: "combo_busy", comboInstanceId: "inst_1", _sum: { lineSubtotal: D("300") } },
        { comboId: "combo_busy", comboInstanceId: "inst_2", _sum: { lineSubtotal: D("300") } },
        { comboId: "combo_quiet", comboInstanceId: "inst_3", _sum: { lineSubtotal: D("300") } },
      ]);

      const result = await service.comboPromotionCandidates("org_1");

      expect(result[0]!.comboId).toBe("combo_quiet");
      expect(result[0]!.instancesSoldLast90Days).toBe(1);
      expect(result[1]!.instancesSoldLast90Days).toBe(2);
    });
  });

  describe("segmentTargetingCandidates", () => {
    it("ranks INACTIVE segments first, then by resolved customer count", async () => {
      segments.list.mockResolvedValue([
        { id: "seg_all", name: "Everyone", type: "ALL" },
        { id: "seg_inactive", name: "Lapsed", type: "INACTIVE" },
      ]);
      segments.resolveCustomerIds.mockImplementation((_org: string, segment: { id: string }) =>
        Promise.resolve(segment.id === "seg_all" ? ["c1", "c2", "c3"] : ["c4"]),
      );

      const result = await service.segmentTargetingCandidates("org_1");

      expect(result[0]!.segmentId).toBe("seg_inactive");
      expect(result[0]!.recommended).toBe(true);
      expect(result[1]!.segmentId).toBe("seg_all");
      expect(result[1]!.recommended).toBe(false);
    });
  });

  describe("campaignResults", () => {
    it("only includes completed/running campaigns, ranked by conversion rate", async () => {
      campaigns.list.mockResolvedValue([
        { id: "camp_draft", name: "Draft", type: "CUSTOM", status: "DRAFT" },
        { id: "camp_low", name: "Low", type: "CUSTOM", status: "COMPLETED" },
        { id: "camp_high", name: "High", type: "CUSTOM", status: "COMPLETED" },
      ]);
      campaigns.getStats.mockImplementation((_org: string, id: string) =>
        Promise.resolve({ conversionRate: id === "camp_high" ? 40 : 10 }),
      );

      const result = await service.campaignResults("org_1");

      expect(result).toHaveLength(2);
      expect(result[0]!.campaignId).toBe("camp_high");
      expect(result[1]!.campaignId).toBe("camp_low");
    });
  });

  describe("minimumProfitableSellingPrice", () => {
    it("404s for a variant from another organization", async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.minimumProfitableSellingPrice("org_1", "variant_from_org_2")).rejects.toThrow(NotFoundException);
    });

    it("computes cost / (1 - minimumMarginPercent/100)", async () => {
      prisma.productVariant.findFirst.mockResolvedValue({
        id: "v1",
        kind: "RETAIL_COMMODITY",
        basePrice: D("100"),
        landedCost: D("40"),
        purchasePrice: null,
      });

      const result = await service.minimumProfitableSellingPrice("org_1", "v1");

      expect(result.cost?.toString()).toBe("40");
      expect(result.minimumProfitablePrice?.toString()).toBe("50"); // 40 / 0.8.
    });
  });
});
