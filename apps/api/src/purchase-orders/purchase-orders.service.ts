import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { InventoryService } from "../inventory/inventory.service.js";
import type { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto.js";
import type { ReceivePurchaseOrderItemDto } from "./dto/receive-purchase-order-item.dto.js";

const PO_INCLUDE = {
  supplier: true,
  kitchen: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: { include: { ingredient: true } },
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async list(organizationId: string, kitchenId?: string, supplierId?: string, status?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        organizationId,
        ...(kitchenId ? { kitchenId } : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(status
          ? { status: status as "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: PO_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, organizationId }, include: PO_INCLUDE });
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }

  async create(organizationId: string, userId: string, dto: CreatePurchaseOrderDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const kitchen = await this.prisma.kitchen.findFirst({ where: { id: dto.kitchenId, organizationId } });
    if (!kitchen) throw new NotFoundException("Kitchen not found");

    const ingredientIds = [...new Set(dto.items.map((i) => i.ingredientId))];
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, organizationId },
    });
    if (ingredients.length !== ingredientIds.length) {
      throw new NotFoundException("One or more ingredients not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.orgPurchaseOrderSequence.upsert({
        where: { organizationId },
        update: { lastNumber: { increment: 1 } },
        create: { organizationId, lastNumber: 1 },
      });
      return tx.purchaseOrder.create({
        data: {
          organizationId,
          supplierId: supplier.id,
          kitchenId: kitchen.id,
          orderNumber: sequence.lastNumber,
          createdByUserId: userId,
          items: {
            create: dto.items.map((item) => ({
              ingredientId: item.ingredientId,
              quantityOrdered: item.quantityOrdered,
              unitCost: item.unitCost,
            })),
          },
        },
        include: PO_INCLUDE,
      });
    });
  }

  /** DRAFT → ORDERED. Items can only be edited while DRAFT, so submitting locks them in. */
  async submit(organizationId: string, id: string) {
    const po = await this.findOne(organizationId, id);
    if (po.status !== "DRAFT") throw new ConflictException(`Purchase order is already ${po.status.toLowerCase()}`);

    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: "ORDERED" } });
    return this.findOne(organizationId, id);
  }

  /** Receives (part of) one line, updates stock at the PO's kitchen, and rolls up the order's own status. */
  async receiveItem(organizationId: string, id: string, itemId: string, dto: ReceivePurchaseOrderItemDto) {
    const po = await this.findOne(organizationId, id);
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") {
      throw new ConflictException(`Cannot receive against a ${po.status.toLowerCase()} purchase order`);
    }

    const item = po.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Purchase order item not found");

    const quantity = new Prisma.Decimal(dto.quantity);
    const newReceived = item.quantityReceived.add(quantity);
    if (newReceived.gt(item.quantityOrdered)) {
      throw new BadRequestException("Cannot receive more than the quantity ordered");
    }

    await this.prisma.purchaseOrderItem.update({
      where: { id: itemId },
      data: { quantityReceived: newReceived },
    });
    await this.inventory.recordReceipt(organizationId, po.kitchenId, item.ingredientId, quantity, itemId);

    const refreshedItems = await this.prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const allReceived = refreshedItems.every((i) => i.quantityReceived.gte(i.quantityOrdered));
    const anyReceived = refreshedItems.some((i) => i.quantityReceived.gt(0));
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status },
    });

    return this.findOne(organizationId, id);
  }

  async cancel(organizationId: string, id: string) {
    const po = await this.findOne(organizationId, id);
    if (po.status === "RECEIVED" || po.status === "CANCELLED") {
      throw new ConflictException(`Purchase order is already ${po.status.toLowerCase()}`);
    }

    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    return this.findOne(organizationId, id);
  }
}
