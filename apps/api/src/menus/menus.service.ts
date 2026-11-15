import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { CreateMenuDto } from "./dto/create-menu.dto.js";
import type { UpdateMenuDto } from "./dto/update-menu.dto.js";
import type { AddMenuItemDto } from "./dto/add-menu-item.dto.js";
import type { AssignMenuToOutletDto } from "./dto/assign-menu-to-outlet.dto.js";
import type { AddComboToMenuDto } from "./dto/add-combo-to-menu.dto.js";

const MENU_INCLUDE = {
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { variant: { include: { product: true } } },
  },
  comboItems: {
    orderBy: { sortOrder: "asc" as const },
    include: { combo: true },
  },
  outletMenus: { include: { outlet: true } },
};

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.menu.findMany({
      where: { organizationId, ...(brandId ? { brandId } : {}) },
      orderBy: { name: "asc" },
      include: MENU_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const menu = await this.prisma.menu.findFirst({ where: { id, organizationId }, include: MENU_INCLUDE });
    if (!menu) throw new NotFoundException("Menu not found");
    return menu;
  }

  async create(organizationId: string, dto: CreateMenuDto) {
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    try {
      return await this.prisma.menu.create({
        data: { organizationId, brandId: brand.id, name: dto.name, description: dto.description },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A menu with this name already exists for this brand");
    }
  }

  async update(organizationId: string, id: string, dto: UpdateMenuDto) {
    await this.assertBelongsToOrg(organizationId, id);
    try {
      return await this.prisma.menu.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err, "A menu with this name already exists for this brand");
    }
  }

  /** Adds a variant to a menu. The variant's product must belong to the menu's own brand. */
  async addItem(organizationId: string, menuId: string, dto: AddMenuItemDto) {
    const menu = await this.assertBelongsToOrg(organizationId, menuId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { organizationId, brandId: menu.brandId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found for this brand");

    try {
      return await this.prisma.menuItem.create({
        data: {
          menuId,
          variantId: variant.id,
          sortOrder: dto.sortOrder,
          isAvailable: dto.isAvailable,
        },
        include: { variant: { include: { product: true } } },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "This variant is already on the menu");
    }
  }

  async removeItem(organizationId: string, menuId: string, variantId: string) {
    await this.assertBelongsToOrg(organizationId, menuId);
    await this.prisma.menuItem.deleteMany({ where: { menuId, variantId } });
    return { success: true } as const;
  }

  /** Adds a combo to a menu. The combo must belong to the menu's own brand. */
  async addComboItem(organizationId: string, menuId: string, dto: AddComboToMenuDto) {
    const menu = await this.assertBelongsToOrg(organizationId, menuId);
    const combo = await this.prisma.combo.findFirst({
      where: { id: dto.comboId, organizationId, brandId: menu.brandId },
    });
    if (!combo) throw new NotFoundException("Combo not found for this brand");

    try {
      return await this.prisma.menuComboItem.create({
        data: { menuId, comboId: combo.id, sortOrder: dto.sortOrder },
        include: { combo: true },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "This combo is already on the menu");
    }
  }

  async removeComboItem(organizationId: string, menuId: string, comboId: string) {
    await this.assertBelongsToOrg(organizationId, menuId);
    await this.prisma.menuComboItem.deleteMany({ where: { menuId, comboId } });
    return { success: true } as const;
  }

  /** Assigns a menu to an outlet. The outlet must belong to the menu's own brand. */
  async assignToOutlet(organizationId: string, menuId: string, dto: AssignMenuToOutletDto) {
    const menu = await this.assertBelongsToOrg(organizationId, menuId);
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: dto.outletId, organizationId, brandId: menu.brandId },
    });
    if (!outlet) throw new NotFoundException("Outlet not found for this brand");

    return this.prisma.outletMenu.upsert({
      where: { outletId_menuId: { outletId: outlet.id, menuId } },
      update: { channel: dto.channel ?? "ALL", isActive: true },
      create: { outletId: outlet.id, menuId, channel: dto.channel ?? "ALL" },
      include: { outlet: true },
    });
  }

  async unassignFromOutlet(organizationId: string, menuId: string, outletId: string) {
    await this.assertBelongsToOrg(organizationId, menuId);
    await this.prisma.outletMenu.deleteMany({ where: { menuId, outletId } });
    return { success: true } as const;
  }

  private async assertBelongsToOrg(organizationId: string, menuId: string) {
    return assertBelongsToOrg(() => this.prisma.menu.findFirst({ where: { id: menuId, organizationId } }), "Menu");
  }

  private mapUniqueError(err: unknown, message: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException(message);
    }
    return err as Error;
  }
}
