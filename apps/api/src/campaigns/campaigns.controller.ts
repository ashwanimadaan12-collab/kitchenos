import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CampaignsService } from "./campaigns.service.js";
import { createCampaignSchema, type CreateCampaignDto } from "./dto/create-campaign.dto.js";
import { campaignFilterSchema, type CampaignFilterDto } from "./dto/campaign-filter.dto.js";

@Controller({ path: "campaigns", version: "1" })
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(campaignFilterSchema)) filters: CampaignFilterDto,
  ) {
    return this.campaigns.list(requireOrganizationId(user), filters);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.campaigns.findOne(requireOrganizationId(user), id);
  }

  @Get(":id/stats")
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async getStats(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.campaigns.getStats(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CAMPAIGN_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCampaignSchema)) dto: CreateCampaignDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const campaign = await this.campaigns.create(organizationId, user.userId, dto);
    await this.audit.log({
      action: "campaign.create",
      entityType: "Campaign",
      entityId: campaign.id,
      organizationId,
      userId: user.userId,
      metadata: { name: dto.name, type: dto.type, segmentId: dto.segmentId },
    });
    return campaign;
  }

  @Post(":id/dispatch")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CAMPAIGN_MANAGE)
  async dispatch(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const campaign = await this.campaigns.dispatchCampaign(organizationId, id);
    await this.audit.log({
      action: "campaign.dispatch",
      entityType: "Campaign",
      entityId: campaign.id,
      organizationId,
      userId: user.userId,
    });
    return campaign;
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CAMPAIGN_MANAGE)
  async cancel(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const campaign = await this.campaigns.cancel(organizationId, id);
    await this.audit.log({
      action: "campaign.cancel",
      entityType: "Campaign",
      entityId: campaign.id,
      organizationId,
      userId: user.userId,
    });
    return campaign;
  }
}
