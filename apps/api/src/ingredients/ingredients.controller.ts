import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { IngredientsService } from "./ingredients.service.js";
import { createIngredientSchema, type CreateIngredientDto } from "./dto/create-ingredient.dto.js";
import { updateIngredientSchema, type UpdateIngredientDto } from "./dto/update-ingredient.dto.js";

@Controller({ path: "ingredients", version: "1" })
export class IngredientsController {
  constructor(
    private readonly ingredients: IngredientsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INGREDIENT_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("kind") kind?: string) {
    return this.ingredients.list(requireOrganizationId(user), kind);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.INGREDIENT_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.ingredients.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INGREDIENT_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createIngredientSchema)) dto: CreateIngredientDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const ingredient = await this.ingredients.create(organizationId, dto);
    await this.audit.log({
      action: "ingredient.create",
      entityType: "Ingredient",
      entityId: ingredient.id,
      organizationId,
      userId: user.userId,
      metadata: { name: ingredient.name, sku: ingredient.sku, kind: ingredient.kind, unit: ingredient.unit },
    });
    return ingredient;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.INGREDIENT_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateIngredientSchema)) dto: UpdateIngredientDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const ingredient = await this.ingredients.update(organizationId, id, dto);
    await this.audit.log({
      action: "ingredient.update",
      entityType: "Ingredient",
      entityId: ingredient.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return ingredient;
  }
}
