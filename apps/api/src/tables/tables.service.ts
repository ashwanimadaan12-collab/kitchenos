import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { OrdersService } from "../orders/orders.service.js";
import type { CreateTableDto } from "./dto/create-table.dto.js";
import type { UpdateTableDto } from "./dto/update-table.dto.js";
import type { PlaceTableOrderDto } from "./dto/place-table-order.dto.js";

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  // ----------------------------------------------------------------- Admin (authenticated)

  /** Each table's `hasOpenOrder` lets the admin table list double as an occupancy view without a separate endpoint. */
  async list(organizationId: string, outletId?: string) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { organizationId, ...(outletId ? { outletId } : {}) },
      orderBy: { name: "asc" },
    });
    const openOrders = await this.prisma.order.findMany({
      where: { organizationId, status: "OPEN", tableId: { in: tables.map((t) => t.id) } },
      select: { id: true, tableId: true, orderNumber: true, total: true },
    });
    const openOrderByTable = new Map(openOrders.map((o) => [o.tableId, o]));
    return tables.map((table) => ({ ...table, openOrder: openOrderByTable.get(table.id) ?? null }));
  }

  async create(organizationId: string, dto: CreateTableDto) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outletId, organizationId } });
    if (!outlet) throw new NotFoundException("Outlet not found");
    try {
      return await this.prisma.restaurantTable.create({ data: { organizationId, outletId: outlet.id, name: dto.name } });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateTableDto) {
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, organizationId } });
    if (!table) throw new NotFoundException("Table not found");
    try {
      return await this.prisma.restaurantTable.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  // ----------------------------------------------------------------- Public (QR ordering)

  /**
   * `qrToken` is the whole authorization model here — whoever scanned the physical table's QR
   * code is trusted to order for it, the same trust boundary a printed QR already has. There's no
   * organizationId in the request at all; the token alone resolves to exactly one table.
   */
  private async findActiveTableByToken(qrToken: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrToken },
      include: { outlet: { include: { brand: true } } },
    });
    if (!table || !table.isActive || !table.outlet.isActive) throw new NotFoundException("Table not found");
    return table;
  }

  async getPublicMenu(qrToken: string) {
    const table = await this.findActiveTableByToken(qrToken);
    const menus = await this.prisma.menu.findMany({
      where: {
        organizationId: table.organizationId,
        brandId: table.outlet.brandId,
        isActive: true,
        outletMenus: { some: { outletId: table.outletId, isActive: true } },
      },
      include: {
        items: {
          where: { isAvailable: true },
          include: { variant: { include: { product: true } } },
        },
      },
    });

    const seenVariantIds = new Set<string>();
    const items = menus
      .flatMap((m) => m.items)
      .filter((item) => item.variant.isActive && item.variant.product.isActive)
      .filter((item) => (seenVariantIds.has(item.variant.id) ? false : (seenVariantIds.add(item.variant.id), true)))
      .map((item) => ({
        variantId: item.variant.id,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        price: item.variant.basePrice,
      }));

    return {
      outletName: table.outlet.name,
      brandName: table.outlet.brand.name,
      tableName: table.name,
      items,
    };
  }

  /**
   * Adds to the table's already-open order if it has one, otherwise opens a new one — so scanning
   * the QR again mid-meal to order more doesn't start a second bill for the same table. Built
   * entirely from OrdersService.create/addItem, the same reuse this codebase's other order-
   * creation paths (POS, offline sync) already lean on, so pricing/tax/KDS/inventory behave
   * identically no matter how the order was opened.
   */
  async placeOrder(qrToken: string, dto: PlaceTableOrderDto) {
    const table = await this.findActiveTableByToken(qrToken);

    let order = await this.prisma.order.findFirst({
      where: { tableId: table.id, status: "OPEN" },
    });
    if (!order) {
      order = await this.orders.create(
        table.organizationId,
        undefined,
        { outletId: table.outletId, channel: "DINE_IN" },
        undefined,
        table.id,
      );
    }

    for (const line of dto.items) {
      await this.orders.addItem(table.organizationId, order.id, line);
    }
    return this.orders.findOne(table.organizationId, order.id);
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A table with this name already exists at this outlet");
    }
    return err as Error;
  }
}
