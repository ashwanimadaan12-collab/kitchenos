import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { ProductCategoriesService } from "./product-categories.service.js";
import { createProductCategorySchema, type CreateProductCategoryDto } from "./dto/create-product-category.dto.js";
import { updateProductCategorySchema, type UpdateProductCategoryDto } from "./dto/update-product-category.dto.js";

@Controller({ path: "product-categories", version: "1" })
export class ProductCategoriesController {
  constructor(
    private readonly categories: ProductCategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_CATEGORY_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.categories.list(requireOrganizationId(user), brandId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PRODUCT_CATEGORY_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.categories.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CATEGORY_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createProductCategorySchema)) dto: CreateProductCategoryDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const category = await this.categories.create(organizationId, dto);
    await this.audit.log({
      action: "product_category.create",
      entityType: "ProductCategory",
      entityId: category.id,
      organizationId,
      userId: user.userId,
      metadata: { brandId: category.brandId, name: category.name },
    });
    return category;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PRODUCT_CATEGORY_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductCategorySchema)) dto: UpdateProductCategoryDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const category = await this.categories.update(organizationId, id, dto);
    await this.audit.log({
      action: "product_category.update",
      entityType: "ProductCategory",
      entityId: category.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return category;
  }
}
