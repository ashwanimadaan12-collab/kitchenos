import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { BrandsService } from "./brands.service.js";
import { createBrandSchema, type CreateBrandDto } from "./dto/create-brand.dto.js";
import { updateBrandSchema, type UpdateBrandDto } from "./dto/update-brand.dto.js";

@Controller({ path: "brands", version: "1" })
export class BrandsController {
  constructor(
    private readonly brands: BrandsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRAND_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.brands.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.BRAND_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.brands.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRAND_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createBrandSchema)) dto: CreateBrandDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const brand = await this.brands.create(organizationId, dto);
    await this.audit.log({
      action: "brand.create",
      entityType: "Brand",
      entityId: brand.id,
      organizationId,
      userId: user.userId,
      metadata: { name: brand.name, slug: brand.slug },
    });
    return brand;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.BRAND_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) dto: UpdateBrandDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const brand = await this.brands.update(organizationId, id, dto);
    await this.audit.log({
      action: "brand.update",
      entityType: "Brand",
      entityId: brand.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return brand;
  }
}
