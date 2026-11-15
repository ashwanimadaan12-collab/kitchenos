import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { LoyaltyService } from "./loyalty.service.js";
import {
  updateLoyaltyProgramSettingsSchema,
  type UpdateLoyaltyProgramSettingsDto,
} from "./dto/update-loyalty-program-settings.dto.js";
import { createLoyaltyTierSchema, type CreateLoyaltyTierDto } from "./dto/create-loyalty-tier.dto.js";
import { updateLoyaltyTierSchema, type UpdateLoyaltyTierDto } from "./dto/update-loyalty-tier.dto.js";
import {
  upsertBrandLoyaltyRuleSchema,
  type UpsertBrandLoyaltyRuleDto,
} from "./dto/upsert-brand-loyalty-rule.dto.js";

@Controller({ path: "loyalty", version: "1" })
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
  ) {}

  @Get("settings")
  @RequirePermissions(PERMISSIONS.LOYALTY_VIEW)
  async getSettings(@CurrentUser() user: RequestUser) {
    return this.loyalty.getSettings(requireOrganizationId(user));
  }

  @Patch("settings")
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  async updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateLoyaltyProgramSettingsSchema)) dto: UpdateLoyaltyProgramSettingsDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const settings = await this.loyalty.updateSettings(organizationId, dto);
    await this.audit.log({
      action: "loyalty_settings.update",
      entityType: "LoyaltyProgramSettings",
      entityId: settings.id,
      organizationId,
      userId: user.userId,
      metadata: dto,
    });
    return settings;
  }

  @Get("tiers")
  @RequirePermissions(PERMISSIONS.LOYALTY_VIEW)
  async listTiers(@CurrentUser() user: RequestUser) {
    return this.loyalty.listTiers(requireOrganizationId(user));
  }

  @Post("tiers")
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  async createTier(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createLoyaltyTierSchema)) dto: CreateLoyaltyTierDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const tier = await this.loyalty.createTier(organizationId, dto);
    await this.audit.log({
      action: "loyalty_tier.create",
      entityType: "LoyaltyTier",
      entityId: tier.id,
      organizationId,
      userId: user.userId,
      metadata: { name: dto.name, minLifetimePoints: dto.minLifetimePoints },
    });
    return tier;
  }

  @Patch("tiers/:id")
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  async updateTier(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLoyaltyTierSchema)) dto: UpdateLoyaltyTierDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const tier = await this.loyalty.updateTier(organizationId, id, dto);
    await this.audit.log({
      action: "loyalty_tier.update",
      entityType: "LoyaltyTier",
      entityId: tier.id,
      organizationId,
      userId: user.userId,
    });
    return tier;
  }

  @Get("brand-rules/:brandId")
  @RequirePermissions(PERMISSIONS.LOYALTY_VIEW)
  async getBrandRule(@CurrentUser() user: RequestUser, @Param("brandId") brandId: string) {
    return this.loyalty.getBrandRule(requireOrganizationId(user), brandId);
  }

  @Put("brand-rules/:brandId")
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  async upsertBrandRule(
    @CurrentUser() user: RequestUser,
    @Param("brandId") brandId: string,
    @Body(new ZodValidationPipe(upsertBrandLoyaltyRuleSchema)) dto: UpsertBrandLoyaltyRuleDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const rule = await this.loyalty.upsertBrandRule(organizationId, brandId, dto);
    await this.audit.log({
      action: "loyalty_brand_rule.upsert",
      entityType: "BrandLoyaltyRule",
      entityId: rule.id,
      organizationId,
      userId: user.userId,
      metadata: { brandId },
    });
    return rule;
  }
}
