import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CombosService } from "./combos.service.js";
import { createComboSchema, type CreateComboDto } from "./dto/create-combo.dto.js";
import { updateComboSchema, type UpdateComboDto } from "./dto/update-combo.dto.js";
import { addComboItemSchema, type AddComboItemDto } from "./dto/add-combo-item.dto.js";
import { updateComboItemSchema, type UpdateComboItemDto } from "./dto/update-combo-item.dto.js";

@Controller({ path: "combos", version: "1" })
export class CombosController {
  constructor(
    private readonly combos: CombosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMBO_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.combos.list(requireOrganizationId(user), brandId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.COMBO_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.combos.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMBO_MANAGE)
  async create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createComboSchema)) dto: CreateComboDto) {
    const organizationId = requireOrganizationId(user);
    const combo = await this.combos.create(organizationId, dto);
    await this.audit.log({
      action: "combo.create",
      entityType: "Combo",
      entityId: combo.id,
      organizationId,
      userId: user.userId,
      metadata: { name: combo.name, comboPrice: combo.comboPrice.toString() },
    });
    return combo;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.COMBO_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateComboSchema)) dto: UpdateComboDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const combo = await this.combos.update(organizationId, id, dto);
    await this.audit.log({
      action: "combo.update",
      entityType: "Combo",
      entityId: combo.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return combo;
  }

  @Post(":id/items")
  @RequirePermissions(PERMISSIONS.COMBO_MANAGE)
  async addItem(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addComboItemSchema)) dto: AddComboItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const item = await this.combos.addItem(organizationId, id, dto);
    await this.audit.log({
      action: "combo.item.add",
      entityType: "Combo",
      entityId: id,
      organizationId,
      userId: user.userId,
      metadata: { variantId: dto.variantId, quantity: dto.quantity },
    });
    return item;
  }

  @Patch(":id/items/:variantId")
  @RequirePermissions(PERMISSIONS.COMBO_MANAGE)
  async updateItem(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodValidationPipe(updateComboItemSchema)) dto: UpdateComboItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const item = await this.combos.updateItem(organizationId, id, variantId, dto);
    await this.audit.log({
      action: "combo.item.update",
      entityType: "Combo",
      entityId: id,
      organizationId,
      userId: user.userId,
      metadata: { variantId, quantity: dto.quantity },
    });
    return item;
  }

  @Delete(":id/items/:variantId")
  @RequirePermissions(PERMISSIONS.COMBO_MANAGE)
  async removeItem(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("variantId") variantId: string) {
    const organizationId = requireOrganizationId(user);
    const result = await this.combos.removeItem(organizationId, id, variantId);
    await this.audit.log({
      action: "combo.item.remove",
      entityType: "Combo",
      entityId: id,
      organizationId,
      userId: user.userId,
      metadata: { variantId },
    });
    return result;
  }
}
