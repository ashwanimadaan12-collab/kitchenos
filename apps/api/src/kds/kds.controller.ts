import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { KdsService } from "./kds.service.js";
import { advanceTicketStatusSchema, type AdvanceTicketStatusDto } from "./dto/advance-ticket-status.dto.js";

@Controller({ path: "kds", version: "1" })
export class KdsController {
  constructor(
    private readonly kds: KdsService,
    private readonly audit: AuditService,
  ) {}

  @Get("stations/:stationId/tickets")
  @RequirePermissions(PERMISSIONS.KDS_VIEW)
  async listForStation(
    @CurrentUser() user: RequestUser,
    @Param("stationId") stationId: string,
    @Query("status") status?: string,
  ) {
    const statuses = status ? status.split(",") : undefined;
    return this.kds.listForStation(requireOrganizationId(user), stationId, statuses);
  }

  @Patch("tickets/:id/status")
  @RequirePermissions(PERMISSIONS.KDS_MANAGE)
  async advanceStatus(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(advanceTicketStatusSchema)) dto: AdvanceTicketStatusDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const ticket = await this.kds.advanceStatus(organizationId, id, dto);
    await this.audit.log({
      action: "kds.ticket.advance",
      entityType: "KitchenTicketItem",
      entityId: ticket.id,
      organizationId,
      userId: user.userId,
      metadata: { status: dto.status },
    });
    return ticket;
  }
}
