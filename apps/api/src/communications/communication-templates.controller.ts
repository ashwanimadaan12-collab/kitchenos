import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CommunicationsService } from "./communications.service.js";
import {
  createCommunicationTemplateSchema,
  type CreateCommunicationTemplateDto,
} from "./dto/create-communication-template.dto.js";
import {
  updateCommunicationTemplateSchema,
  type UpdateCommunicationTemplateDto,
} from "./dto/update-communication-template.dto.js";

@Controller({ path: "communication-templates", version: "1" })
export class CommunicationTemplatesController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMMUNICATION_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query("channel") channel?: "WHATSAPP" | "SMS",
    @Query("brandId") brandId?: string,
  ) {
    return this.communications.listTemplates(requireOrganizationId(user), { channel, brandId });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCommunicationTemplateSchema)) dto: CreateCommunicationTemplateDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const template = await this.communications.createTemplate(organizationId, dto);
    await this.audit.log({
      action: "communication_template.create",
      entityType: "CommunicationTemplate",
      entityId: template.id,
      organizationId,
      userId: user.userId,
      metadata: { channel: dto.channel, purpose: dto.purpose, key: dto.key },
    });
    return template;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCommunicationTemplateSchema)) dto: UpdateCommunicationTemplateDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const template = await this.communications.updateTemplate(organizationId, id, dto);
    await this.audit.log({
      action: "communication_template.update",
      entityType: "CommunicationTemplate",
      entityId: template.id,
      organizationId,
      userId: user.userId,
    });
    return template;
  }
}
