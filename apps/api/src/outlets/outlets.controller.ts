import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { OutletsService } from "./outlets.service.js";
import { createOutletSchema, type CreateOutletDto } from "./dto/create-outlet.dto.js";
import { updateOutletSchema, type UpdateOutletDto } from "./dto/update-outlet.dto.js";
import { mapOutletKitchenSchema, type MapOutletKitchenDto } from "./dto/map-outlet-kitchen.dto.js";

@Controller({ path: "outlets", version: "1" })
export class OutletsController {
  constructor(
    private readonly outlets: OutletsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OUTLET_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.outlets.list(requireOrganizationId(user), brandId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.OUTLET_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.outlets.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OUTLET_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createOutletSchema)) dto: CreateOutletDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const outlet = await this.outlets.create(organizationId, dto);
    await this.audit.log({
      action: "outlet.create",
      entityType: "Outlet",
      entityId: outlet.id,
      organizationId,
      userId: user.userId,
      metadata: { name: outlet.name, code: outlet.code, brandId: outlet.brandId },
    });
    return outlet;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.OUTLET_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOutletSchema)) dto: UpdateOutletDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const outlet = await this.outlets.update(organizationId, id, dto);
    await this.audit.log({
      action: "outlet.update",
      entityType: "Outlet",
      entityId: outlet.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return outlet;
  }

  @Post(":id/kitchens")
  @RequirePermissions(PERMISSIONS.OUTLET_MANAGE)
  async mapKitchen(
    @CurrentUser() user: RequestUser,
    @Param("id") outletId: string,
    @Body(new ZodValidationPipe(mapOutletKitchenSchema)) dto: MapOutletKitchenDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const mapping = await this.outlets.mapKitchen(organizationId, outletId, dto);
    await this.audit.log({
      action: "outlet.kitchen.map",
      entityType: "OutletKitchen",
      entityId: mapping.id,
      organizationId,
      userId: user.userId,
      metadata: { outletId, kitchenId: dto.kitchenId, isPrimary: dto.isPrimary ?? false },
    });
    return mapping;
  }

  @Delete(":id/kitchens/:kitchenId")
  @RequirePermissions(PERMISSIONS.OUTLET_MANAGE)
  async unmapKitchen(
    @CurrentUser() user: RequestUser,
    @Param("id") outletId: string,
    @Param("kitchenId") kitchenId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.outlets.unmapKitchen(organizationId, outletId, kitchenId);
    await this.audit.log({
      action: "outlet.kitchen.unmap",
      entityType: "OutletKitchen",
      organizationId,
      userId: user.userId,
      metadata: { outletId, kitchenId },
    });
    return result;
  }
}
