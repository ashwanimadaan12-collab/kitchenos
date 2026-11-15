import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CommunicationsService } from "./communications.service.js";
import {
  sendCommunicationMessageSchema,
  type SendCommunicationMessageDto,
} from "./dto/send-communication-message.dto.js";
import {
  communicationMessageFilterSchema,
  type CommunicationMessageFilterDto,
} from "./dto/communication-message-filter.dto.js";

@Controller({ path: "communications/messages", version: "1" })
export class CommunicationMessagesController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMMUNICATION_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(communicationMessageFilterSchema)) filters: CommunicationMessageFilterDto,
  ) {
    return this.communications.listMessages(requireOrganizationId(user), filters);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async send(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(sendCommunicationMessageSchema)) dto: SendCommunicationMessageDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const message = await this.communications.sendMessage(organizationId, dto);
    await this.audit.log({
      action: "communication_message.send",
      entityType: "CommunicationMessage",
      entityId: message.id,
      organizationId,
      userId: user.userId,
      metadata: { customerId: dto.customerId, channel: dto.channel, purpose: dto.purpose, status: message.status },
    });
    return message;
  }

  @Post(":id/retry")
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async retry(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const message = await this.communications.retryMessage(organizationId, id);
    await this.audit.log({
      action: "communication_message.retry",
      entityType: "CommunicationMessage",
      entityId: message.id,
      organizationId,
      userId: user.userId,
      metadata: { status: message.status },
    });
    return message;
  }

  /**
   * Manual trigger for the same dispatch pass the interval timer runs automatically — useful
   * for tests and for an admin who doesn't want to wait for the next 30s tick.
   */
  @Post("dispatch-due")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.COMMUNICATION_MANAGE)
  async dispatchDue(@CurrentUser() user: RequestUser) {
    const dispatched = await this.communications.dispatchDue(requireOrganizationId(user));
    return { dispatched };
  }
}
