import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { PricingRulesService } from "./pricing-rules.service.js";
import { createPricingRuleSchema, type CreatePricingRuleDto } from "./dto/create-pricing-rule.dto.js";
import { updatePricingRuleSchema, type UpdatePricingRuleDto } from "./dto/update-pricing-rule.dto.js";
import { updatePricingSettingsSchema, type UpdatePricingSettingsDto } from "./dto/update-pricing-settings.dto.js";
import { priceQuoteQuerySchema, type PriceQuoteQueryDto } from "./dto/price-quote-query.dto.js";

@Controller({ path: "pricing", version: "1" })
export class PricingRulesController {
  constructor(
    private readonly pricingRules: PricingRulesService,
    private readonly audit: AuditService,
  ) {}

  @Get("settings")
  @RequirePermissions(PERMISSIONS.PRICE_VIEW)
  async getSettings(@CurrentUser() user: RequestUser) {
    return this.pricingRules.getSettings(requireOrganizationId(user));
  }

  @Patch("settings")
  @RequirePermissions(PERMISSIONS.PRICE_MANAGE)
  async updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updatePricingSettingsSchema)) dto: UpdatePricingSettingsDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const settings = await this.pricingRules.updateSettings(organizationId, dto);
    await this.audit.log({
      action: "pricing.settings.update",
      entityType: "PricingSettings",
      entityId: settings.id,
      organizationId,
      userId: user.userId,
      metadata: { minimumMarginPercent: dto.minimumMarginPercent },
    });
    return settings;
  }

  @Get("quote")
  @RequirePermissions(PERMISSIONS.PRICE_VIEW)
  async quote(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(priceQuoteQuerySchema)) query: PriceQuoteQueryDto,
  ) {
    return this.pricingRules.quote(requireOrganizationId(user), query);
  }

  @Get("rules")
  @RequirePermissions(PERMISSIONS.PRICE_VIEW)
  async listRules(
    @CurrentUser() user: RequestUser,
    @Query("variantId") variantId?: string,
    @Query("outletId") outletId?: string,
  ) {
    return this.pricingRules.listRules(requireOrganizationId(user), { variantId, outletId });
  }

  @Post("rules")
  @RequirePermissions(PERMISSIONS.PRICE_MANAGE)
  async createRule(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createPricingRuleSchema)) dto: CreatePricingRuleDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const rule = await this.pricingRules.createRule(organizationId, dto);
    await this.audit.log({
      action: "pricing.rule.create",
      entityType: "PricingRule",
      entityId: rule.id,
      organizationId,
      userId: user.userId,
      metadata: { category: dto.category, label: dto.label },
    });
    return rule;
  }

  @Patch("rules/:id")
  @RequirePermissions(PERMISSIONS.PRICE_MANAGE)
  async updateRule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePricingRuleSchema)) dto: UpdatePricingRuleDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const rule = await this.pricingRules.updateRule(organizationId, id, dto);
    await this.audit.log({
      action: "pricing.rule.update",
      entityType: "PricingRule",
      entityId: rule.id,
      organizationId,
      userId: user.userId,
    });
    return rule;
  }
}
