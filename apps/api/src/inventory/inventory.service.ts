import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { AdjustStockDto } from "./dto/adjust-stock.dto.js";
import type { SetReorderPointDto } from "./dto/set-reorder-point.dto.js";

const { Decimal } = Prisma;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listStockForKitchen(organizationId: string, kitchenId: string) {
    await this.assertKitchenBelongsToOrg(organizationId, kitchenId);
    return this.prisma.stockBalance.findMany({
      where: { kitchenId },
      include: { ingredient: true },
      orderBy: { ingredient: { name: "asc" } },
    });
  }

  async listMovements(organizationId: string, kitchenId: string, ingredientId?: string) {
    await this.assertKitchenBelongsToOrg(organizationId, kitchenId);
    return this.prisma.stockMovement.findMany({
      where: { kitchenId, ...(ingredientId ? { ingredientId } : {}) },
      include: { ingredient: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async adjustStock(organizationId: string, kitchenId: string, dto: AdjustStockDto) {
    await this.assertKitchenBelongsToOrg(organizationId, kitchenId);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: dto.ingredientId, organizationId },
    });
    if (!ingredient) throw new NotFoundException("Ingredient not found");

    return this.applyMovement({
      organizationId,
      kitchenId,
      ingredientId: ingredient.id,
      type: dto.type,
      quantityDelta: dto.quantityDelta,
      note: dto.note,
    });
  }

  async setReorderPoint(organizationId: string, kitchenId: string, dto: SetReorderPointDto) {
    await this.assertKitchenBelongsToOrg(organizationId, kitchenId);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: dto.ingredientId, organizationId },
    });
    if (!ingredient) throw new NotFoundException("Ingredient not found");

    return this.prisma.stockBalance.upsert({
      where: { kitchenId_ingredientId: { kitchenId, ingredientId: ingredient.id } },
      update: { reorderPoint: dto.reorderPoint },
      create: { organizationId, kitchenId, ingredientId: ingredient.id, reorderPoint: dto.reorderPoint },
    });
  }

  /** Called when a purchase order item is received. Always inside the caller's own operation. */
  async recordReceipt(organizationId: string, kitchenId: string, ingredientId: string, quantity: Prisma.Decimal, referenceId: string) {
    return this.applyMovement({
      organizationId,
      kitchenId,
      ingredientId,
      type: "RECEIPT",
      quantityDelta: quantity,
      referenceType: "PurchaseOrderItem",
      referenceId,
    });
  }

  /**
   * Deducts the recipe's ingredients for an order item from the outlet's
   * primary fulfilling kitchen. `quantityMultiplier` is signed: pass the
   * full line quantity when the item is first added, or just the delta
   * (negative when a quantity edit reduces it) to keep stock in sync
   * without rewriting any earlier ledger entry. Best-effort: a sale must
   * never fail because of inventory bookkeeping, so any failure here is
   * logged, never thrown — the same principle audit logging already follows.
   */
  async consumeForOrderItem(
    organizationId: string,
    outletId: string,
    orderItemId: string,
    variantId: string,
    quantityMultiplier: number,
  ) {
    try {
      const primaryKitchen = await this.prisma.outletKitchen.findFirst({
        where: { outletId, isPrimary: true, isActive: true },
      });
      if (!primaryKitchen) return;

      const recipe = await this.prisma.recipe.findFirst({
        where: { variantId, organizationId },
        include: { ingredients: true },
      });
      if (!recipe) return;

      for (const line of recipe.ingredients) {
        await this.applyMovement({
          organizationId,
          kitchenId: primaryKitchen.kitchenId,
          ingredientId: line.ingredientId,
          type: "CONSUMPTION",
          quantityDelta: line.quantity.mul(quantityMultiplier).neg(),
          referenceType: "OrderItem",
          referenceId: orderItemId,
        });
      }
    } catch (err) {
      this.logger.error(`Failed to consume stock for order item "${orderItemId}"`, err);
    }
  }

  /** Reverses whatever was consumed for a now-voided order item, as new ledger entries (never rewriting history). */
  async reverseForOrderItem(organizationId: string, orderItemId: string) {
    try {
      const consumedMovements = await this.prisma.stockMovement.findMany({
        where: { organizationId, referenceType: "OrderItem", referenceId: orderItemId, type: "CONSUMPTION" },
      });
      for (const movement of consumedMovements) {
        await this.applyMovement({
          organizationId,
          kitchenId: movement.kitchenId,
          ingredientId: movement.ingredientId,
          type: "ADJUSTMENT",
          quantityDelta: movement.quantityDelta.neg(),
          referenceType: "OrderItem",
          referenceId: orderItemId,
          note: "Reversal of voided order item",
        });
      }
    } catch (err) {
      this.logger.error(`Failed to reverse stock for voided order item "${orderItemId}"`, err);
    }
  }

  private async applyMovement(input: {
    organizationId: string;
    kitchenId: string;
    ingredientId: string;
    type: "RECEIPT" | "CONSUMPTION" | "WASTAGE" | "ADJUSTMENT";
    quantityDelta: Prisma.Decimal | string;
    referenceType?: string;
    referenceId?: string;
    note?: string;
  }) {
    const delta = new Decimal(input.quantityDelta);
    const [, balance] = await this.prisma.$transaction([
      this.prisma.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          kitchenId: input.kitchenId,
          ingredientId: input.ingredientId,
          type: input.type,
          quantityDelta: delta,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          note: input.note,
        },
      }),
      this.prisma.stockBalance.upsert({
        where: { kitchenId_ingredientId: { kitchenId: input.kitchenId, ingredientId: input.ingredientId } },
        update: { quantityOnHand: { increment: delta } },
        create: {
          organizationId: input.organizationId,
          kitchenId: input.kitchenId,
          ingredientId: input.ingredientId,
          quantityOnHand: delta,
        },
      }),
    ]);
    return balance;
  }

  private async assertKitchenBelongsToOrg(organizationId: string, kitchenId: string) {
    return assertBelongsToOrg(
      () => this.prisma.kitchen.findFirst({ where: { id: kitchenId, organizationId } }),
      "Kitchen",
    );
  }
}
