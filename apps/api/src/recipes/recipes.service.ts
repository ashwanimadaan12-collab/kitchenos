import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { CreateRecipeDto } from "./dto/create-recipe.dto.js";
import type { UpdateRecipeDto } from "./dto/update-recipe.dto.js";
import type { AddRecipeIngredientDto } from "./dto/add-recipe-ingredient.dto.js";
import type { UpdateRecipeIngredientDto } from "./dto/update-recipe-ingredient.dto.js";

const RECIPE_INCLUDE = {
  variant: { include: { product: true } },
  preparationStation: true,
  ingredients: { include: { ingredient: true } },
  overheadCosts: true,
};

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.recipe.findMany({
      where: { organizationId, ...(brandId ? { variant: { product: { brandId } } } : {}) },
      orderBy: { createdAt: "desc" },
      include: RECIPE_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({ where: { id, organizationId }, include: RECIPE_INCLUDE });
    if (!recipe) throw new NotFoundException("Recipe not found");
    return recipe;
  }

  async findByVariant(organizationId: string, variantId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { variantId, organizationId },
      include: RECIPE_INCLUDE,
    });
    if (!recipe) throw new NotFoundException("Recipe not found for this variant");
    return recipe;
  }

  async create(organizationId: string, dto: CreateRecipeDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { organizationId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found");

    const stationId = await this.assertStationBelongsToOrg(organizationId, dto.preparationStationId);

    try {
      return await this.prisma.recipe.create({
        data: {
          organizationId,
          variantId: variant.id,
          preparationStationId: stationId,
          yieldQuantity: dto.yieldQuantity,
          instructions: dto.instructions,
        },
        include: RECIPE_INCLUDE,
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateRecipeDto) {
    await this.findOne(organizationId, id);

    const data: Prisma.RecipeUncheckedUpdateInput = {
      yieldQuantity: dto.yieldQuantity,
      instructions: dto.instructions,
      isActive: dto.isActive,
    };
    if (dto.preparationStationId !== undefined) {
      data.preparationStationId = await this.assertStationBelongsToOrg(organizationId, dto.preparationStationId);
    }

    return this.prisma.recipe.update({ where: { id }, data, include: RECIPE_INCLUDE });
  }

  /** Adds an ingredient line. The ingredient must belong to the caller's organization. */
  async addIngredient(organizationId: string, recipeId: string, dto: AddRecipeIngredientDto) {
    await this.assertBelongsToOrg(organizationId, recipeId);
    const ingredient = await this.prisma.ingredient.findFirst({ where: { id: dto.ingredientId, organizationId } });
    if (!ingredient) throw new NotFoundException("Ingredient not found");

    try {
      return await this.prisma.recipeIngredient.create({
        data: { recipeId, ingredientId: ingredient.id, quantity: dto.quantity },
        include: { ingredient: true },
      });
    } catch (err) {
      throw this.mapDuplicateLineError(err);
    }
  }

  async updateIngredient(
    organizationId: string,
    recipeId: string,
    ingredientId: string,
    dto: UpdateRecipeIngredientDto,
  ) {
    await this.assertBelongsToOrg(organizationId, recipeId);
    const line = await this.prisma.recipeIngredient.findFirst({ where: { recipeId, ingredientId } });
    if (!line) throw new NotFoundException("Recipe ingredient line not found");

    return this.prisma.recipeIngredient.update({
      where: { id: line.id },
      data: { quantity: dto.quantity },
      include: { ingredient: true },
    });
  }

  async removeIngredient(organizationId: string, recipeId: string, ingredientId: string) {
    await this.assertBelongsToOrg(organizationId, recipeId);
    await this.prisma.recipeIngredient.deleteMany({ where: { recipeId, ingredientId } });
    return { success: true } as const;
  }

  private async assertBelongsToOrg(organizationId: string, recipeId: string) {
    return assertBelongsToOrg(
      () => this.prisma.recipe.findFirst({ where: { id: recipeId, organizationId } }),
      "Recipe",
    );
  }

  /** Returns the validated station id (or undefined/null passthrough), 404ing if it belongs to another org. */
  private async assertStationBelongsToOrg(
    organizationId: string,
    stationId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (!stationId) return stationId;
    const station = await assertBelongsToOrg(
      () => this.prisma.kitchenStation.findFirst({ where: { id: stationId, kitchen: { organizationId } } }),
      "Kitchen station",
    );
    return station.id;
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("This variant already has a recipe");
    }
    return err as Error;
  }

  private mapDuplicateLineError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("This ingredient is already on the recipe");
    }
    return err as Error;
  }
}
