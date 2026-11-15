import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { PromotionsService } from "./promotions.service.js";
import { createPromotionSchema, type CreatePromotionDto } from "./dto/create-promotion.dto.js";
import { updatePromotionSchema, type UpdatePromotionDto } from "./dto/update-promotion.dto.js";

@Controller({ path: "promotions", version: "1" })
export class PromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROMOTION_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.promotions.list(requireOrganizationId(user), brandId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PROMOTION_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.promotions.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROMOTION_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createPromotionSchema)) dto: CreatePromotionDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const promotion = await this.promotions.create(organizationId, dto);
    await this.audit.log({
      action: "promotion.create",
      entityType: "Promotion",
      entityId: promotion.id,
      organizationId,
      userId: user.userId,
      metadata: { code: promotion.code, type: promotion.type, value: promotion.value.toString() },
    });
    return promotion;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PROMOTION_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePromotionSchema)) dto: UpdatePromotionDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const promotion = await this.promotions.update(organizationId, id, dto);
    await this.audit.log({
      action: "promotion.update",
      entityType: "Promotion",
      entityId: promotion.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return promotion;
  }
}
