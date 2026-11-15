import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { ProductsService } from "./products.service.js";
import { createProductSchema, type CreateProductDto } from "./dto/create-product.dto.js";
import { updateProductSchema, type UpdateProductDto } from "./dto/update-product.dto.js";
import { createProductVariantSchema, type CreateProductVariantDto } from "./dto/create-product-variant.dto.js";
import { updateProductVariantSchema, type UpdateProductVariantDto } from "./dto/update-product-variant.dto.js";

@Controller({ path: "products", version: "1" })
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query("brandId") brandId?: string,
    @Query("categoryId") categoryId?: string,
  ) {
    return this.products.list(requireOrganizationId(user), brandId, categoryId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PRODUCT_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.products.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const product = await this.products.create(organizationId, dto);
    await this.audit.log({
      action: "product.create",
      entityType: "Product",
      entityId: product.id,
      organizationId,
      userId: user.userId,
      metadata: { brandId: product.brandId, name: product.name, sku: product.sku, variantCount: dto.variants.length },
    });
    return product;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const product = await this.products.update(organizationId, id, dto);
    await this.audit.log({
      action: "product.update",
      entityType: "Product",
      entityId: product.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return product;
  }

  @Post(":id/variants")
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  async addVariant(
    @CurrentUser() user: RequestUser,
    @Param("id") productId: string,
    @Body(new ZodValidationPipe(createProductVariantSchema)) dto: CreateProductVariantDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const variant = await this.products.addVariant(organizationId, productId, dto);
    await this.audit.log({
      action: "product.variant.create",
      entityType: "ProductVariant",
      entityId: variant.id,
      organizationId,
      userId: user.userId,
      metadata: { productId, name: variant.name, sku: variant.sku, basePrice: variant.basePrice.toString() },
    });
    return variant;
  }

  @Patch(":id/variants/:variantId")
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  async updateVariant(
    @CurrentUser() user: RequestUser,
    @Param("id") productId: string,
    @Param("variantId") variantId: string,
    @Body(new ZodValidationPipe(updateProductVariantSchema)) dto: UpdateProductVariantDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const variant = await this.products.updateVariant(organizationId, productId, variantId, dto);
    await this.audit.log({
      action: "product.variant.update",
      entityType: "ProductVariant",
      entityId: variant.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return variant;
  }
}
