import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "./costing.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("CostingService", () => {
  let service: CostingService;
  let prisma: {
    productVariant: { findFirst: jest.Mock };
    recipe: { findFirst: jest.Mock };
    outlet: { findFirst: jest.Mock };
    outletProductPrice: { findFirst: jest.Mock };
    ingredient: { findFirst: jest.Mock; update: jest.Mock };
    ingredientCostHistory: { create: jest.Mock; findMany: jest.Mock };
    recipeOverheadCost: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      productVariant: { findFirst: jest.fn() },
      recipe: { findFirst: jest.fn() },
      outlet: { findFirst: jest.fn() },
      outletProductPrice: { findFirst: jest.fn() },
      ingredient: { findFirst: jest.fn(), update: jest.fn() },
      ingredientCostHistory: { create: jest.fn(), findMany: jest.fn() },
      recipeOverheadCost: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const module = await Test.createTestingModule({
      providers: [CostingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CostingService);
  });

  it("computeVariantCost() 404s for a variant from another organization", async () => {
    prisma.productVariant.findFirst.mockResolvedValue(null);
    await expect(service.computeVariantCost("org_1", "variant_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("computeVariantCost() 404s when the variant has no recipe", async () => {
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1", basePrice: D("100") });
    prisma.recipe.findFirst.mockResolvedValue(null);
    await expect(service.computeVariantCost("org_1", "variant_1")).rejects.toThrow(NotFoundException);
  });

  it("computes ingredient + overhead cost against base price, flagging ingredients with no cost set", async () => {
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1", basePrice: D("499") });
    prisma.recipe.findFirst.mockResolvedValue({
      id: "recipe_1",
      yieldQuantity: 1,
      ingredients: [
        { quantity: D("0.3"), ingredient: { id: "ing_dough", costPerUnit: D("60") } },
        { quantity: D("0.15"), ingredient: { id: "ing_mozz", costPerUnit: D("450") } },
        { quantity: D("3"), ingredient: { id: "ing_eggs", costPerUnit: null } },
      ],
      overheadCosts: [{ amount: D("30") }],
    });

    const result = await service.computeVariantCost("org_1", "variant_1");

    // 0.3*60 + 0.15*450 = 18 + 67.5 = 85.5 ingredient cost; + 30 overhead = 115.5 total
    expect(result.ingredientCost.toString()).toBe("85.5");
    expect(result.overheadCost.toString()).toBe("30");
    expect(result.totalCost.toString()).toBe("115.5");
    expect(result.costPerYieldUnit.toString()).toBe("115.5");
    expect(result.sellingPrice.toString()).toBe("499");
    expect(result.priceSource).toBe("base_price");
    expect(result.marginAmount.toString()).toBe("383.5");
    expect(result.missingCostIngredientIds).toEqual(["ing_eggs"]);
  });

  it("uses an active outlet price override instead of the base price when present", async () => {
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1", basePrice: D("90") });
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", yieldQuantity: 1, ingredients: [], overheadCosts: [] });
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1" });
    prisma.outletProductPrice.findFirst.mockResolvedValue({ price: D("100"), isActive: true });

    const result = await service.computeVariantCost("org_1", "variant_1", "outlet_1");

    expect(result.sellingPrice.toString()).toBe("100");
    expect(result.priceSource).toBe("outlet_override");
  });

  it("computeVariantCost() 404s for an outlet from another organization", async () => {
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1", basePrice: D("90") });
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", yieldQuantity: 1, ingredients: [], overheadCosts: [] });
    prisma.outlet.findFirst.mockResolvedValue(null);

    await expect(service.computeVariantCost("org_1", "variant_1", "outlet_from_org_2")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("setIngredientCost() 404s for an ingredient from another organization", async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(service.setIngredientCost("org_1", "ing_from_org_2", { costPerUnit: "1.00" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("setIngredientCost() updates the ingredient and logs a history row in one transaction", async () => {
    prisma.ingredient.findFirst.mockResolvedValue({ id: "ing_1", organizationId: "org_1" });
    prisma.ingredient.update.mockResolvedValue({ id: "ing_1", costPerUnit: D("42") });
    prisma.ingredientCostHistory.create.mockResolvedValue({ id: "hist_1" });

    const result = await service.setIngredientCost("org_1", "ing_1", { costPerUnit: "42.0000" });

    expect(result).toEqual({ id: "ing_1", costPerUnit: D("42") });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: "ing_1" },
      data: { costPerUnit: "42.0000" },
    });
    expect(prisma.ingredientCostHistory.create).toHaveBeenCalledWith({
      data: { ingredientId: "ing_1", costPerUnit: "42.0000" },
    });
  });

  it("addOverheadCost() 404s for a recipe from another organization", async () => {
    prisma.recipe.findFirst.mockResolvedValue(null);
    await expect(
      service.addOverheadCost("org_1", "recipe_from_org_2", { label: "Labor", amount: "10.00" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("maps a duplicate overhead label to a 409 Conflict", async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", organizationId: "org_1" });
    prisma.recipeOverheadCost.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(
      service.addOverheadCost("org_1", "recipe_1", { label: "Labor", amount: "10.00" }),
    ).rejects.toThrow(ConflictException);
  });
});
