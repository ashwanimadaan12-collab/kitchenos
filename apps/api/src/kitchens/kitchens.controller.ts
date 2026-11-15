import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { KitchensService } from "./kitchens.service.js";
import { createKitchenSchema, type CreateKitchenDto } from "./dto/create-kitchen.dto.js";
import { updateKitchenSchema, type UpdateKitchenDto } from "./dto/update-kitchen.dto.js";
import { createKitchenStationSchema, type CreateKitchenStationDto } from "./dto/create-kitchen-station.dto.js";
import { updateKitchenStationSchema, type UpdateKitchenStationDto } from "./dto/update-kitchen-station.dto.js";
import { mapBrandKitchenSchema, type MapBrandKitchenDto } from "./dto/map-brand-kitchen.dto.js";

@Controller({ path: "kitchens", version: "1" })
export class KitchensController {
  constructor(
    private readonly kitchens: KitchensService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.KITCHEN_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.kitchens.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.KITCHEN_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.kitchens.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createKitchenSchema)) dto: CreateKitchenDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const kitchen = await this.kitchens.create(organizationId, dto);
    await this.audit.log({
      action: "kitchen.create",
      entityType: "Kitchen",
      entityId: kitchen.id,
      organizationId,
      userId: user.userId,
      metadata: { name: kitchen.name, code: kitchen.code, kind: kitchen.kind },
    });
    return kitchen;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateKitchenSchema)) dto: UpdateKitchenDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const kitchen = await this.kitchens.update(organizationId, id, dto);
    await this.audit.log({
      action: "kitchen.update",
      entityType: "Kitchen",
      entityId: kitchen.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return kitchen;
  }

  @Post(":id/stations")
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async addStation(
    @CurrentUser() user: RequestUser,
    @Param("id") kitchenId: string,
    @Body(new ZodValidationPipe(createKitchenStationSchema)) dto: CreateKitchenStationDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const station = await this.kitchens.addStation(organizationId, kitchenId, dto);
    await this.audit.log({
      action: "kitchen.station.create",
      entityType: "KitchenStation",
      entityId: station.id,
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, name: station.name, code: station.code },
    });
    return station;
  }

  @Patch(":id/stations/:stationId")
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async updateStation(
    @CurrentUser() user: RequestUser,
    @Param("id") kitchenId: string,
    @Param("stationId") stationId: string,
    @Body(new ZodValidationPipe(updateKitchenStationSchema)) dto: UpdateKitchenStationDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const station = await this.kitchens.updateStation(organizationId, kitchenId, stationId, dto);
    await this.audit.log({
      action: "kitchen.station.update",
      entityType: "KitchenStation",
      entityId: station.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return station;
  }

  @Post(":id/brands")
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async mapBrand(
    @CurrentUser() user: RequestUser,
    @Param("id") kitchenId: string,
    @Body(new ZodValidationPipe(mapBrandKitchenSchema)) dto: MapBrandKitchenDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const mapping = await this.kitchens.mapBrand(organizationId, kitchenId, dto);
    await this.audit.log({
      action: "kitchen.brand.map",
      entityType: "BrandKitchen",
      entityId: mapping.id,
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, brandId: dto.brandId, isPrimary: dto.isPrimary ?? false },
    });
    return mapping;
  }

  @Delete(":id/brands/:brandId")
  @RequirePermissions(PERMISSIONS.KITCHEN_MANAGE)
  async unmapBrand(
    @CurrentUser() user: RequestUser,
    @Param("id") kitchenId: string,
    @Param("brandId") brandId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.kitchens.unmapBrand(organizationId, kitchenId, brandId);
    await this.audit.log({
      action: "kitchen.brand.unmap",
      entityType: "BrandKitchen",
      organizationId,
      userId: user.userId,
      metadata: { kitchenId, brandId },
    });
    return result;
  }
}
