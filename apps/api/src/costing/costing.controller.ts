import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CostingService } from "./costing.service.js";
import { setIngredientCostSchema, type SetIngredientCostDto } from "./dto/set-ingredient-cost.dto.js";
import {
  createRecipeOverheadCostSchema,
  type CreateRecipeOverheadCostDto,
} from "./dto/create-recipe-overhead-cost.dto.js";
import {
  updateRecipeOverheadCostSchema,
  type UpdateRecipeOverheadCostDto,
} from "./dto/update-recipe-overhead-cost.dto.js";

@Controller({ path: "costing", version: "1" })
export class CostingController {
  constructor(
    private readonly costing: CostingService,
    private readonly audit: AuditService,
  ) {}

  @Get("ingredients/:id/history")
  @RequirePermissions(PERMISSIONS.COST_VIEW)
  async getIngredientCostHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.costing.getIngredientCostHistory(requireOrganizationId(user), id);
  }

  @Patch("ingredients/:id")
  @RequirePermissions(PERMISSIONS.COST_MANAGE)
  async setIngredientCost(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setIngredientCostSchema)) dto: SetIngredientCostDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const ingredient = await this.costing.setIngredientCost(organizationId, id, dto);
    await this.audit.log({
      action: "ingredient.cost.set",
      entityType: "Ingredient",
      entityId: ingredient.id,
      organizationId,
      userId: user.userId,
      metadata: { costPerUnit: dto.costPerUnit },
    });
    return ingredient;
  }

  @Get("variants/:variantId")
  @RequirePermissions(PERMISSIONS.COST_VIEW)
  async computeVariantCost(
    @CurrentUser() user: RequestUser,
    @Param("variantId") variantId: string,
    @Query("outletId") outletId?: string,
  ) {
    return this.costing.computeVariantCost(requireOrganizationId(user), variantId, outletId);
  }

  @Post("recipes/:recipeId/overheads")
  @RequirePermissions(PERMISSIONS.COST_MANAGE)
  async addOverheadCost(
    @CurrentUser() user: RequestUser,
    @Param("recipeId") recipeId: string,
    @Body(new ZodValidationPipe(createRecipeOverheadCostSchema)) dto: CreateRecipeOverheadCostDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const overhead = await this.costing.addOverheadCost(organizationId, recipeId, dto);
    await this.audit.log({
      action: "recipe.overhead.add",
      entityType: "RecipeOverheadCost",
      entityId: overhead.id,
      organizationId,
      userId: user.userId,
      metadata: { recipeId, label: dto.label, amount: dto.amount },
    });
    return overhead;
  }

  @Patch("recipes/:recipeId/overheads/:overheadId")
  @RequirePermissions(PERMISSIONS.COST_MANAGE)
  async updateOverheadCost(
    @CurrentUser() user: RequestUser,
    @Param("recipeId") recipeId: string,
    @Param("overheadId") overheadId: string,
    @Body(new ZodValidationPipe(updateRecipeOverheadCostSchema)) dto: UpdateRecipeOverheadCostDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const overhead = await this.costing.updateOverheadCost(organizationId, recipeId, overheadId, dto);
    await this.audit.log({
      action: "recipe.overhead.update",
      entityType: "RecipeOverheadCost",
      entityId: overhead.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return overhead;
  }

  @Delete("recipes/:recipeId/overheads/:overheadId")
  @RequirePermissions(PERMISSIONS.COST_MANAGE)
  async removeOverheadCost(
    @CurrentUser() user: RequestUser,
    @Param("recipeId") recipeId: string,
    @Param("overheadId") overheadId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.costing.removeOverheadCost(organizationId, recipeId, overheadId);
    await this.audit.log({
      action: "recipe.overhead.remove",
      entityType: "RecipeOverheadCost",
      organizationId,
      userId: user.userId,
      metadata: { recipeId, overheadId },
    });
    return result;
  }
}
