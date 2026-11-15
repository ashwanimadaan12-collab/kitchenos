import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import type { CommunicationChannel } from "@kitchenos/database";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CommunicationsService } from "./communications.service.js";
import {
  recordCommunicationConsentSchema,
  type RecordCommunicationConsentDto,
} from "./dto/record-communication-consent.dto.js";
import { optOutCommunicationSchema, type OptOutCommunicationDto } from "./dto/opt-out-communication.dto.js";

@Controller({ path: "customers/:customerId/communication-preferences", version: "1" })
export class CommunicationPreferencesController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMMUNICATION_VIEW)
  async list(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.communications.listPreferences(requireOrganizationId(user), customerId);
  }

  @Post(":channel/consent")
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async recordConsent(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Param("channel") channel: CommunicationChannel,
    @Body(new ZodValidationPipe(recordCommunicationConsentSchema)) dto: RecordCommunicationConsentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const preference = await this.communications.recordConsent(organizationId, customerId, channel, dto, user.userId);
    await this.audit.log({
      action: "communication_preference.consent",
      entityType: "Customer",
      entityId: customerId,
      organizationId,
      userId: user.userId,
      metadata: { channel, source: dto.source },
    });
    return preference;
  }

  @Post(":channel/opt-out")
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async optOut(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Param("channel") channel: CommunicationChannel,
    @Body(new ZodValidationPipe(optOutCommunicationSchema)) dto: OptOutCommunicationDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const preference = await this.communications.optOut(organizationId, customerId, channel, dto);
    await this.audit.log({
      action: "communication_preference.opt_out",
      entityType: "Customer",
      entityId: customerId,
      organizationId,
      userId: user.userId,
      metadata: { channel, scope: dto.scope },
    });
    return preference;
  }
}
