import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { TaxCategoriesService } from "./tax-categories.service.js";
import { createTaxCategorySchema, type CreateTaxCategoryDto } from "./dto/create-tax-category.dto.js";
import { updateTaxCategorySchema, type UpdateTaxCategoryDto } from "./dto/update-tax-category.dto.js";

@Controller({ path: "tax-categories", version: "1" })
export class TaxCategoriesController {
  constructor(
    private readonly taxCategories: TaxCategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TAX_CATEGORY_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.taxCategories.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.TAX_CATEGORY_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.taxCategories.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TAX_CATEGORY_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createTaxCategorySchema)) dto: CreateTaxCategoryDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const category = await this.taxCategories.create(organizationId, dto);
    await this.audit.log({
      action: "tax_category.create",
      entityType: "TaxCategory",
      entityId: category.id,
      organizationId,
      userId: user.userId,
      metadata: { name: category.name, ratePercent: category.ratePercent.toString() },
    });
    return category;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.TAX_CATEGORY_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaxCategorySchema)) dto: UpdateTaxCategoryDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const category = await this.taxCategories.update(organizationId, id, dto);
    await this.audit.log({
      action: "tax_category.update",
      entityType: "TaxCategory",
      entityId: category.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return category;
  }
}
