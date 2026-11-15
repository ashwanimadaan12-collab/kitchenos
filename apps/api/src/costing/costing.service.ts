import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { SetIngredientCostDto } from "./dto/set-ingredient-cost.dto.js";
import type { CreateRecipeOverheadCostDto } from "./dto/create-recipe-overhead-cost.dto.js";
import type { UpdateRecipeOverheadCostDto } from "./dto/update-recipe-overhead-cost.dto.js";

const { Decimal } = Prisma;

export interface VariantCostBreakdown {
  variantId: string;
  recipeId: string;
  ingredientCost: Prisma.Decimal;
  overheadCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  yieldQuantity: number;
  costPerYieldUnit: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  priceSource: "outlet_override" | "base_price";
  marginAmount: Prisma.Decimal;
  marginPercent: Prisma.Decimal | null;
  missingCostIngredientIds: string[];
}

@Injectable()
export class CostingService {
  constructor(private readonly prisma: PrismaService) {}

  async getIngredientCostHistory(organizationId: string, ingredientId: string) {
    await this.assertIngredientBelongsToOrg(organizationId, ingredientId);
    return this.prisma.ingredientCostHistory.findMany({
      where: { ingredientId },
      orderBy: { effectiveAt: "desc" },
    });
  }

  /** Sets a new cost for the ingredient, logging the change rather than silently overwriting it. */
  async setIngredientCost(organizationId: string, ingredientId: string, dto: SetIngredientCostDto) {
    await this.assertIngredientBelongsToOrg(organizationId, ingredientId);

    const [ingredient] = await this.prisma.$transaction([
      this.prisma.ingredient.update({ where: { id: ingredientId }, data: { costPerUnit: dto.costPerUnit } }),
      this.prisma.ingredientCostHistory.create({
        data: { ingredientId, costPerUnit: dto.costPerUnit },
      }),
    ]);
    return ingredient;
  }

  async computeVariantCost(organizationId: string, variantId: string, outletId?: string): Promise<VariantCostBreakdown> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { organizationId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found");

    const recipe = await this.prisma.recipe.findFirst({
      where: { variantId, organizationId },
      include: { ingredients: { include: { ingredient: true } }, overheadCosts: true },
    });
    if (!recipe) throw new NotFoundException("Recipe not found for this variant");

    let sellingPrice = variant.basePrice;
    let priceSource: "outlet_override" | "base_price" = "base_price";
    if (outletId) {
      const outlet = await this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } });
      if (!outlet) throw new NotFoundException("Outlet not found");
      const override = await this.prisma.outletProductPrice.findFirst({
        where: { outletId, variantId, isActive: true },
      });
      if (override) {
        sellingPrice = override.price;
        priceSource = "outlet_override";
      }
    }

    const missingCostIngredientIds: string[] = [];
    let ingredientCost = new Decimal(0);
    for (const line of recipe.ingredients) {
      if (line.ingredient.costPerUnit === null) {
        missingCostIngredientIds.push(line.ingredient.id);
        continue;
      }
      ingredientCost = ingredientCost.add(line.quantity.mul(line.ingredient.costPerUnit));
    }

    const overheadCost = recipe.overheadCosts.reduce((sum, o) => sum.add(o.amount), new Decimal(0));
    const totalCost = ingredientCost.add(overheadCost);
    const yieldQuantity = recipe.yieldQuantity > 0 ? recipe.yieldQuantity : 1;
    const costPerYieldUnit = totalCost.div(yieldQuantity);
    const marginAmount = sellingPrice.sub(costPerYieldUnit);
    const marginPercent = sellingPrice.isZero() ? null : marginAmount.div(sellingPrice).mul(100);

    return {
      variantId,
      recipeId: recipe.id,
      ingredientCost,
      overheadCost,
      totalCost,
      yieldQuantity,
      costPerYieldUnit,
      sellingPrice,
      priceSource,
      marginAmount,
      marginPercent,
      missingCostIngredientIds,
    };
  }

  async addOverheadCost(organizationId: string, recipeId: string, dto: CreateRecipeOverheadCostDto) {
    await this.assertRecipeBelongsToOrg(organizationId, recipeId);
    try {
      return await this.prisma.recipeOverheadCost.create({
        data: { recipeId, label: dto.label, amount: dto.amount },
      });
    } catch (err) {
      throw this.mapDuplicateLabelError(err);
    }
  }

  async updateOverheadCost(
    organizationId: string,
    recipeId: string,
    overheadId: string,
    dto: UpdateRecipeOverheadCostDto,
  ) {
    await this.assertRecipeBelongsToOrg(organizationId, recipeId);
    const overhead = await this.prisma.recipeOverheadCost.findFirst({ where: { id: overheadId, recipeId } });
    if (!overhead) throw new NotFoundException("Recipe overhead cost not found");

    try {
      return await this.prisma.recipeOverheadCost.update({ where: { id: overheadId }, data: dto });
    } catch (err) {
      throw this.mapDuplicateLabelError(err);
    }
  }

  async removeOverheadCost(organizationId: string, recipeId: string, overheadId: string) {
    await this.assertRecipeBelongsToOrg(organizationId, recipeId);
    await this.prisma.recipeOverheadCost.deleteMany({ where: { id: overheadId, recipeId } });
    return { success: true } as const;
  }

  private async assertIngredientBelongsToOrg(organizationId: string, ingredientId: string) {
    return assertBelongsToOrg(
      () => this.prisma.ingredient.findFirst({ where: { id: ingredientId, organizationId } }),
      "Ingredient",
    );
  }

  private async assertRecipeBelongsToOrg(organizationId: string, recipeId: string) {
    return assertBelongsToOrg(
      () => this.prisma.recipe.findFirst({ where: { id: recipeId, organizationId } }),
      "Recipe",
    );
  }

  private mapDuplicateLabelError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("An overhead cost with this label already exists on this recipe");
    }
    return err as Error;
  }
}
