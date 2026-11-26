import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  PERMISSIONS,
  riderInputSchema,
  updateRiderSchema,
  type RiderInputDto,
  type UpdateRiderDto,
} from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { RidersService } from "./riders.service.js";

@Controller({ path: "riders", version: "1" })
export class RidersController {
  constructor(
    private readonly riders: RidersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query("outletId") outletId?: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.riders.list(requireOrganizationId(user), outletId, includeInactive === "true");
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(riderInputSchema)) dto: RiderInputDto) {
    const organizationId = requireOrganizationId(user);
    const rider = await this.riders.create(organizationId, dto);
    await this.audit.log({
      action: "rider.create",
      entityType: "DeliveryRider",
      entityId: rider.id,
      organizationId,
      userId: user.userId,
    });
    return rider;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRiderSchema)) dto: UpdateRiderDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const rider = await this.riders.update(organizationId, id, dto);
    await this.audit.log({
      action: "rider.update",
      entityType: "DeliveryRider",
      entityId: rider.id,
      organizationId,
      userId: user.userId,
    });
    return rider;
  }

  @Delete(":id")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async deactivate(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const rider = await this.riders.deactivate(organizationId, id);
    await this.audit.log({
      action: "rider.deactivate",
      entityType: "DeliveryRider",
      entityId: rider.id,
      organizationId,
      userId: user.userId,
    });
    return rider;
  }
}
