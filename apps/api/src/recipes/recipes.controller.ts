import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { RecipesService } from "./recipes.service.js";
import { createRecipeSchema, type CreateRecipeDto } from "./dto/create-recipe.dto.js";
import { updateRecipeSchema, type UpdateRecipeDto } from "./dto/update-recipe.dto.js";
import { addRecipeIngredientSchema, type AddRecipeIngredientDto } from "./dto/add-recipe-ingredient.dto.js";
import { updateRecipeIngredientSchema, type UpdateRecipeIngredientDto } from "./dto/update-recipe-ingredient.dto.js";

@Controller({ path: "recipes", version: "1" })
export class RecipesController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECIPE_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.recipes.list(requireOrganizationId(user), brandId);
  }

  @Get("by-variant/:variantId")
  @RequirePermissions(PERMISSIONS.RECIPE_VIEW)
  async findByVariant(@CurrentUser() user: RequestUser, @Param("variantId") variantId: string) {
    return this.recipes.findByVariant(requireOrganizationId(user), variantId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.RECIPE_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.recipes.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECIPE_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createRecipeSchema)) dto: CreateRecipeDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const recipe = await this.recipes.create(organizationId, dto);
    await this.audit.log({
      action: "recipe.create",
      entityType: "Recipe",
      entityId: recipe.id,
      organizationId,
      userId: user.userId,
      metadata: { variantId: dto.variantId, preparationStationId: dto.preparationStationId },
    });
    return recipe;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.RECIPE_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRecipeSchema)) dto: UpdateRecipeDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const recipe = await this.recipes.update(organizationId, id, dto);
    await this.audit.log({
      action: "recipe.update",
      entityType: "Recipe",
      entityId: recipe.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return recipe;
  }

  @Post(":id/ingredients")
  @RequirePermissions(PERMISSIONS.RECIPE_MANAGE)
  async addIngredient(
    @CurrentUser() user: RequestUser,
    @Param("id") recipeId: string,
    @Body(new ZodValidationPipe(addRecipeIngredientSchema)) dto: AddRecipeIngredientDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const line = await this.recipes.addIngredient(organizationId, recipeId, dto);
    await this.audit.log({
      action: "recipe.ingredient.add",
      entityType: "RecipeIngredient",
      entityId: line.id,
      organizationId,
      userId: user.userId,
      metadata: { recipeId, ingredientId: dto.ingredientId, quantity: dto.quantity },
    });
    return line;
  }

  @Patch(":id/ingredients/:ingredientId")
  @RequirePermissions(PERMISSIONS.RECIPE_MANAGE)
  async updateIngredient(
    @CurrentUser() user: RequestUser,
    @Param("id") recipeId: string,
    @Param("ingredientId") ingredientId: string,
    @Body(new ZodValidationPipe(updateRecipeIngredientSchema)) dto: UpdateRecipeIngredientDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const line = await this.recipes.updateIngredient(organizationId, recipeId, ingredientId, dto);
    await this.audit.log({
      action: "recipe.ingredient.update",
      entityType: "RecipeIngredient",
      entityId: line.id,
      organizationId,
      userId: user.userId,
      metadata: { recipeId, ingredientId, quantity: dto.quantity },
    });
    return line;
  }

  @Delete(":id/ingredients/:ingredientId")
  @RequirePermissions(PERMISSIONS.RECIPE_MANAGE)
  async removeIngredient(
    @CurrentUser() user: RequestUser,
    @Param("id") recipeId: string,
    @Param("ingredientId") ingredientId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.recipes.removeIngredient(organizationId, recipeId, ingredientId);
    await this.audit.log({
      action: "recipe.ingredient.remove",
      entityType: "RecipeIngredient",
      organizationId,
      userId: user.userId,
      metadata: { recipeId, ingredientId },
    });
    return result;
  }
}
