import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { MenusService } from "./menus.service.js";
import { createMenuSchema, type CreateMenuDto } from "./dto/create-menu.dto.js";
import { updateMenuSchema, type UpdateMenuDto } from "./dto/update-menu.dto.js";
import { addMenuItemSchema, type AddMenuItemDto } from "./dto/add-menu-item.dto.js";
import { assignMenuToOutletSchema, type AssignMenuToOutletDto } from "./dto/assign-menu-to-outlet.dto.js";
import { addComboToMenuSchema, type AddComboToMenuDto } from "./dto/add-combo-to-menu.dto.js";

@Controller({ path: "menus", version: "1" })
export class MenusController {
  constructor(
    private readonly menus: MenusService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("brandId") brandId?: string) {
    return this.menus.list(requireOrganizationId(user), brandId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.MENU_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.menus.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createMenuSchema)) dto: CreateMenuDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const menu = await this.menus.create(organizationId, dto);
    await this.audit.log({
      action: "menu.create",
      entityType: "Menu",
      entityId: menu.id,
      organizationId,
      userId: user.userId,
      metadata: { brandId: menu.brandId, name: menu.name },
    });
    return menu;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMenuSchema)) dto: UpdateMenuDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const menu = await this.menus.update(organizationId, id, dto);
    await this.audit.log({
      action: "menu.update",
      entityType: "Menu",
      entityId: menu.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return menu;
  }

  @Post(":id/items")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async addItem(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Body(new ZodValidationPipe(addMenuItemSchema)) dto: AddMenuItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const item = await this.menus.addItem(organizationId, menuId, dto);
    await this.audit.log({
      action: "menu.item.add",
      entityType: "MenuItem",
      entityId: item.id,
      organizationId,
      userId: user.userId,
      metadata: { menuId, variantId: dto.variantId },
    });
    return item;
  }

  @Delete(":id/items/:variantId")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async removeItem(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Param("variantId") variantId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.menus.removeItem(organizationId, menuId, variantId);
    await this.audit.log({
      action: "menu.item.remove",
      entityType: "MenuItem",
      organizationId,
      userId: user.userId,
      metadata: { menuId, variantId },
    });
    return result;
  }

  @Post(":id/combo-items")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async addComboItem(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Body(new ZodValidationPipe(addComboToMenuSchema)) dto: AddComboToMenuDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const item = await this.menus.addComboItem(organizationId, menuId, dto);
    await this.audit.log({
      action: "menu.combo_item.add",
      entityType: "MenuComboItem",
      entityId: item.id,
      organizationId,
      userId: user.userId,
      metadata: { menuId, comboId: dto.comboId },
    });
    return item;
  }

  @Delete(":id/combo-items/:comboId")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async removeComboItem(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Param("comboId") comboId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.menus.removeComboItem(organizationId, menuId, comboId);
    await this.audit.log({
      action: "menu.combo_item.remove",
      entityType: "MenuComboItem",
      organizationId,
      userId: user.userId,
      metadata: { menuId, comboId },
    });
    return result;
  }

  @Post(":id/outlets")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async assignToOutlet(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Body(new ZodValidationPipe(assignMenuToOutletSchema)) dto: AssignMenuToOutletDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const mapping = await this.menus.assignToOutlet(organizationId, menuId, dto);
    await this.audit.log({
      action: "menu.outlet.assign",
      entityType: "OutletMenu",
      entityId: mapping.id,
      organizationId,
      userId: user.userId,
      metadata: { menuId, outletId: dto.outletId, channel: dto.channel ?? "ALL" },
    });
    return mapping;
  }

  @Delete(":id/outlets/:outletId")
  @RequirePermissions(PERMISSIONS.MENU_MANAGE)
  async unassignFromOutlet(
    @CurrentUser() user: RequestUser,
    @Param("id") menuId: string,
    @Param("outletId") outletId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const result = await this.menus.unassignFromOutlet(organizationId, menuId, outletId);
    await this.audit.log({
      action: "menu.outlet.unassign",
      entityType: "OutletMenu",
      organizationId,
      userId: user.userId,
      metadata: { menuId, outletId },
    });
    return result;
  }
}
