import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { RecipesService } from "./recipes.service.js";

describe("RecipesService", () => {
  let service: RecipesService;
  let prisma: {
    recipe: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    kitchenStation: { findFirst: jest.Mock };
    ingredient: { findFirst: jest.Mock };
    recipeIngredient: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      recipe: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      kitchenStation: { findFirst: jest.fn() },
      ingredient: { findFirst: jest.fn() },
      recipeIngredient: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [RecipesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RecipesService);
  });

  it("refuses to create a recipe for a variant belonging to another organization", async () => {
    prisma.productVariant.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", { variantId: "variant_from_org_2" })).rejects.toThrow(NotFoundException);
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it("refuses to create a recipe using a preparation station from another organization", async () => {
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1" });
    prisma.kitchenStation.findFirst.mockResolvedValue(null); // org-scoped lookup finds nothing

    await expect(
      service.create("org_1", { variantId: "variant_1", preparationStationId: "station_from_org_2" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.kitchenStation.findFirst).toHaveBeenCalledWith({
      where: { id: "station_from_org_2", kitchen: { organizationId: "org_1" } },
    });
    expect(prisma.recipe.create).not.toHaveBeenCalled();
  });

  it("findByVariant() 404s instead of leaking a recipe from another organization", async () => {
    prisma.recipe.findFirst.mockResolvedValue(null);
    await expect(service.findByVariant("org_1", "variant_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("refuses to add an ingredient from another organization to a recipe", async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", organizationId: "org_1" });
    prisma.ingredient.findFirst.mockResolvedValue(null); // org-scoped lookup finds nothing

    await expect(
      service.addIngredient("org_1", "recipe_1", { ingredientId: "ing_from_org_2", quantity: "1" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.recipeIngredient.create).not.toHaveBeenCalled();
  });

  it("adds an ingredient line when both recipe and ingredient belong to the caller's organization", async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", organizationId: "org_1" });
    prisma.ingredient.findFirst.mockResolvedValue({ id: "ing_1", organizationId: "org_1" });
    prisma.recipeIngredient.create.mockResolvedValue({ id: "ri_1" });

    const result = await service.addIngredient("org_1", "recipe_1", { ingredientId: "ing_1", quantity: "0.5" });

    expect(result).toEqual({ id: "ri_1" });
    expect(prisma.recipeIngredient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { recipeId: "recipe_1", ingredientId: "ing_1", quantity: "0.5" } }),
    );
  });
});
