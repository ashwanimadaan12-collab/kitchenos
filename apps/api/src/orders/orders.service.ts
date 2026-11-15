import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import { KdsService } from "../kds/kds.service.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { PromotionsService } from "../promotions/promotions.service.js";
import { CommunicationsService } from "../communications/communications.service.js";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { PricingRulesService } from "../pricing/pricing-rules.service.js";
import type { CreateOrderDto } from "./dto/create-order.dto.js";
import type { AddOrderItemDto } from "./dto/add-order-item.dto.js";
import type { UpdateOrderItemDto } from "./dto/update-order-item.dto.js";
import type { AddPaymentDto } from "./dto/add-payment.dto.js";
import type { AddComboOrderItemDto } from "./dto/add-combo-order-item.dto.js";
import type { ApplyPromotionDto } from "./dto/apply-promotion.dto.js";
import type { AssignCustomerToOrderDto } from "./dto/assign-customer-to-order.dto.js";
import type { RedeemLoyaltyPointsDto } from "./dto/redeem-loyalty-points.dto.js";
import type { SyncOfflineOrderDto } from "./dto/sync-offline-order.dto.js";

const { Decimal } = Prisma;

const ORDER_INCLUDE = {
  outlet: { include: { brand: { select: { name: true } } } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: { orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "asc" as const } },
  promotion: true,
  customer: true,
  loyaltyRedemption: true,
  table: { select: { id: true, name: true } },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kds: KdsService,
    private readonly inventory: InventoryService,
    private readonly promotions: PromotionsService,
    private readonly communications: CommunicationsService,
    private readonly loyalty: LoyaltyService,
    private readonly campaigns: CampaignsService,
    private readonly pricingRules: PricingRulesService,
  ) {}

  async list(organizationId: string, outletId?: string, status?: string) {
    return this.prisma.order.findMany({
      where: {
        organizationId,
        ...(outletId ? { outletId } : {}),
        ...(status ? { status: status as "OPEN" | "PAID" | "VOIDED" } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, organizationId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /**
   * Opens a new order at an outlet, assigning the next gap-free order number for that outlet.
   * `userId` is optional only for an order with no staff originator — a customer's own QR-ordering
   * submission (see TablesService.placeOrder); every staff-initiated order (POS, offline sync)
   * still always passes it.
   */
  async create(organizationId: string, userId: string | undefined, dto: CreateOrderDto, clientOrderId?: string, tableId?: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outletId, organizationId } });
    if (!outlet) throw new NotFoundException("Outlet not found");
    if (dto.customerId) await this.assertCustomerBelongsToOrg(organizationId, dto.customerId);

    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.outletOrderSequence.upsert({
        where: { outletId: outlet.id },
        update: { lastNumber: { increment: 1 } },
        create: { outletId: outlet.id, lastNumber: 1 },
      });
      return tx.order.create({
        data: {
          organizationId,
          outletId: outlet.id,
          orderNumber: sequence.lastNumber,
          channel: dto.channel,
          customerId: dto.customerId,
          createdByUserId: userId,
          clientOrderId,
          tableId,
        },
        include: ORDER_INCLUDE,
      });
    });
  }

  /**
   * Replays an order a cashier took on the POS's offline screen (see `syncOfflineOrderSchema`
   * for why this is deliberately narrower than normal order-taking: no combos, promotions,
   * loyalty redemption, or customer — only plain items and a cash payment). Built entirely from
   * the same `create`/`addItem`/`addPayment` this order would have gone through if the device
   * had been online the whole time, so pricing, tax, KDS ticket creation, inventory consumption
   * and the OPEN -> PAID transition all behave identically either way — nothing here re-derives
   * that logic. The one new rule is idempotency: `clientOrderId` was generated on-device before
   * the order ever reached the server, so a retried sync (the response was lost, the device went
   * offline again mid-call) must resolve to the SAME order, never a second one.
   *
   * Prices are resolved fresh from live pricing rules at sync time, not from whatever estimate
   * the offline screen showed the cashier — the client is never trusted for the actual charge,
   * the same stance this codebase takes everywhere else money is calculated. If a sync fails
   * partway through (an item's variant was deactivated in the meantime, say), the order this far
   * is left OPEN rather than rolled back — it shows up in the normal POS "open orders" list for
   * a cashier to finish by hand, and a later retry of the same clientOrderId resumes at that
   * existing order rather than creating a duplicate or re-adding items that already landed.
   */
  async syncOfflineOrder(organizationId: string, userId: string, dto: SyncOfflineOrderDto) {
    const existing = await this.prisma.order.findFirst({ where: { organizationId, clientOrderId: dto.clientOrderId } });
    const order = existing ?? (await this.create(organizationId, userId, { outletId: dto.outletId, channel: dto.channel }, dto.clientOrderId));
    if (order.status !== "OPEN") return this.findOne(organizationId, order.id);

    const alreadyAddedVariantIds = new Set(
      (await this.prisma.orderItem.findMany({ where: { orderId: order.id, status: "ACTIVE" }, select: { variantId: true } })).map(
        (i) => i.variantId,
      ),
    );
    for (const line of dto.items) {
      if (alreadyAddedVariantIds.has(line.variantId)) continue; // Already landed on a previous, partially-failed sync attempt.
      await this.addItem(organizationId, order.id, line);
    }

    const existingPayments = await this.prisma.payment.count({ where: { orderId: order.id } });
    if (existingPayments === 0) {
      await this.addPayment(organizationId, order.id, { method: "CASH", amount: dto.cashTendered });
    }
    return this.findOne(organizationId, order.id);
  }

  /** Links (or relinks) a recognized customer to an open order — e.g. the cashier looks them up mid-order. */
  async assignCustomer(organizationId: string, orderId: string, dto: AssignCustomerToOrderDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    await this.assertCustomerBelongsToOrg(organizationId, dto.customerId);

    await this.prisma.order.update({ where: { id: order.id }, data: { customerId: dto.customerId } });
    return this.findOne(organizationId, order.id);
  }

  async removeCustomer(organizationId: string, orderId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    await this.prisma.order.update({ where: { id: order.id }, data: { customerId: null } });
    return this.findOne(organizationId, order.id);
  }

  /** Adds an item priced from the outlet's own price (override or base) and taxed from the product's tax category. */
  async addItem(organizationId: string, orderId: string, dto: AddOrderItemDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { organizationId } },
      include: { product: { include: { taxCategory: true } } },
    });
    if (!variant) throw new NotFoundException("Product variant not found");

    const sellable = await this.prisma.menuItem.findFirst({
      where: {
        variantId: variant.id,
        isAvailable: true,
        menu: { isActive: true, outletMenus: { some: { outletId: order.outletId, isActive: true } } },
      },
    });
    if (!sellable) throw new NotFoundException("This item is not on an active menu at this outlet");

    const quote = await this.pricingRules.quote(organizationId, {
      variantId: variant.id,
      outletId: order.outletId,
      channel: order.channel,
    });
    // Locked in permanently at the moment the item is added — never re-resolved against a
    // pricing rule that changes afterwards, matching this codebase's standing rule that a
    // confirmed price is never rewritten retrospectively.
    const unitPrice = quote.finalPrice;
    const taxRatePercent = variant.product.taxCategory?.ratePercent ?? new Decimal(0);

    const lineSubtotal = unitPrice.mul(dto.quantity);
    const taxAmount = lineSubtotal.mul(taxRatePercent).div(100);
    const lineTotal = lineSubtotal.add(taxAmount);

    const item = await this.prisma.orderItem.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        unitPrice,
        quantity: dto.quantity,
        taxRatePercent,
        lineSubtotal,
        taxAmount,
        lineTotal,
        pricingRuleId: quote.selectedRule?.id,
        pricingRuleLabel: quote.selectedRule?.label,
      },
    });
    await this.kds.createTicketForOrderItem(organizationId, item.id, variant.id);
    await this.inventory.consumeForOrderItem(organizationId, order.outletId, item.id, variant.id, dto.quantity);

    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  async updateItemQuantity(organizationId: string, orderId: string, itemId: string, dto: UpdateOrderItemDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId: order.id, status: "ACTIVE" } });
    if (!item) throw new NotFoundException("Order item not found");
    if (item.comboInstanceId) {
      throw new ConflictException("This item is part of a combo — void the whole combo and re-add it instead");
    }

    const lineSubtotal = item.unitPrice.mul(dto.quantity);
    const taxAmount = lineSubtotal.mul(item.taxRatePercent).div(100);
    const lineTotal = lineSubtotal.add(taxAmount);

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity, lineSubtotal, taxAmount, lineTotal },
    });
    const quantityDelta = dto.quantity - item.quantity;
    if (quantityDelta !== 0) {
      await this.inventory.consumeForOrderItem(organizationId, order.outletId, item.id, item.variantId, quantityDelta);
    }

    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Items are voided, never hard-deleted, so a closed bill always shows exactly what happened. */
  async removeItem(organizationId: string, orderId: string, itemId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId: order.id, status: "ACTIVE" } });
    if (!item) throw new NotFoundException("Order item not found");
    if (item.comboInstanceId) {
      throw new ConflictException("This item is part of a combo — void the whole combo instead");
    }

    await this.prisma.orderItem.update({ where: { id: itemId }, data: { status: "VOIDED" } });
    await this.kds.cancelTicketForOrderItem(organizationId, itemId);
    await this.inventory.reverseForOrderItem(organizationId, itemId);
    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /**
   * Adds a combo to the order. It expands into one OrderItem per component
   * variant — reusing the same per-variant KDS routing and recipe-based
   * inventory consumption as an ordinary item — rather than being its own
   * line type. The combo's bundle price is allocated across those lines
   * proportionally to each component's own base price, with the last line
   * taking the rounding remainder so the lines always sum to exactly
   * comboPrice × quantity.
   */
  async addComboItem(organizationId: string, orderId: string, dto: AddComboOrderItemDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);

    const combo = await this.prisma.combo.findFirst({
      where: { id: dto.comboId, organizationId, isActive: true },
      include: { items: { include: { variant: { include: { product: { include: { taxCategory: true } } } } } } },
    });
    if (!combo) throw new NotFoundException("Combo not found");

    const sellable = await this.prisma.menuComboItem.findFirst({
      where: {
        comboId: combo.id,
        isAvailable: true,
        menu: { isActive: true, outletMenus: { some: { outletId: order.outletId, isActive: true } } },
      },
    });
    if (!sellable) throw new NotFoundException("This combo is not on an active menu at this outlet");

    const naturalTotal = combo.items.reduce((sum, i) => sum.add(i.variant.basePrice.mul(i.quantity)), new Decimal(0));
    const comboTotalPrice = combo.comboPrice.mul(dto.quantity);
    const comboInstanceId = randomUUID();
    // If every component is priced at zero (e.g. a promo combo built entirely from free add-ons),
    // natural-price proportional allocation has nothing to divide by — split the combo price evenly instead.
    const allocateEqually = naturalTotal.isZero();

    let allocatedSoFar = new Decimal(0);
    const entries = Array.from(combo.items.entries());
    const lines = entries.map(([i, line]) => {
      const isLast = i === entries.length - 1;
      const lineSubtotal = isLast
        ? comboTotalPrice.sub(allocatedSoFar)
        : allocateEqually
          ? comboTotalPrice.div(entries.length).toDecimalPlaces(2)
          : comboTotalPrice.mul(line.variant.basePrice.mul(line.quantity)).div(naturalTotal).toDecimalPlaces(2);
      allocatedSoFar = allocatedSoFar.add(lineSubtotal);

      const quantity = line.quantity * dto.quantity;
      const unitPrice = lineSubtotal.div(quantity).toDecimalPlaces(2);
      const taxRatePercent = line.variant.product.taxCategory?.ratePercent ?? new Decimal(0);
      const taxAmount = lineSubtotal.mul(taxRatePercent).div(100).toDecimalPlaces(2);
      const lineTotal = lineSubtotal.add(taxAmount);

      return { line, quantity, unitPrice, taxRatePercent, lineSubtotal, taxAmount, lineTotal };
    });

    await Promise.all(
      lines.map(async ({ line, quantity, unitPrice, taxRatePercent, lineSubtotal, taxAmount, lineTotal }) => {
        const item = await this.prisma.orderItem.create({
          data: {
            orderId: order.id,
            variantId: line.variant.id,
            productName: combo.name,
            variantName: line.variant.name,
            unitPrice,
            quantity,
            taxRatePercent,
            lineSubtotal,
            taxAmount,
            lineTotal,
            comboId: combo.id,
            comboInstanceId,
            comboName: combo.name,
          },
        });
        await this.kds.createTicketForOrderItem(organizationId, item.id, line.variant.id);
        await this.inventory.consumeForOrderItem(organizationId, order.outletId, item.id, line.variant.id, quantity);
      }),
    );

    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Voids every component line of one combo instance together, atomically as a bundle. */
  async removeComboItem(organizationId: string, orderId: string, comboInstanceId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: order.id, comboInstanceId, status: "ACTIVE" },
    });
    if (items.length === 0) throw new NotFoundException("Combo instance not found on this order");

    await Promise.all(
      items.map(async (item) => {
        await this.prisma.orderItem.update({ where: { id: item.id }, data: { status: "VOIDED" } });
        await this.kds.cancelTicketForOrderItem(organizationId, item.id);
        await this.inventory.reverseForOrderItem(organizationId, item.id);
      }),
    );

    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Applies a coupon code. At most one promotion can be active on an order at a time. */
  async applyPromotion(organizationId: string, orderId: string, dto: ApplyPromotionDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    if (order.promotionId) throw new ConflictException("A promotion is already applied to this order");

    const { promotion, discountAmount } = await this.promotions.validateAndComputeDiscount(
      organizationId,
      order,
      dto.code,
    );
    await this.promotions.recordRedemption(organizationId, order.id, promotion.id, discountAmount);
    await this.prisma.order.update({ where: { id: order.id }, data: { promotionId: promotion.id, discountAmount } });
    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Removes the applied promotion and un-counts its redemption (e.g. the cashier typed the wrong code). */
  async removePromotion(organizationId: string, orderId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    if (!order.promotionId) throw new NotFoundException("No promotion applied to this order");

    await this.promotions.clearRedemption(organizationId, order.id);
    await this.prisma.order.update({ where: { id: order.id }, data: { promotionId: null, discountAmount: new Decimal(0) } });
    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /**
   * Redeems loyalty points against an open order. Points are debited from the customer's
   * balance immediately (a ledger REDEEM row), not at payment time — the same reservation
   * shape as applyPromotion — so two concurrently open orders can never spend the same points.
   */
  async redeemLoyaltyPoints(organizationId: string, orderId: string, dto: RedeemLoyaltyPointsDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    if (!order.customerId) throw new BadRequestException("This order has no linked customer");
    const existing = await this.prisma.loyaltyRedemption.findUnique({ where: { orderId: order.id } });
    if (existing) throw new ConflictException("Loyalty points have already been redeemed on this order");

    const redemption = await this.loyalty.redeemPoints(organizationId, order.id, order.customerId, dto.points, order.outlet.brandId);
    await this.prisma.order.update({
      where: { id: order.id },
      data: { loyaltyPointsRedeemed: redemption.pointsRedeemed, loyaltyDiscountAmount: redemption.discountAmount },
    });
    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Removes a redemption and credits the points back (e.g. the cashier applied the wrong amount). */
  async removeLoyaltyRedemption(organizationId: string, orderId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const existing = await this.prisma.loyaltyRedemption.findUnique({ where: { orderId: order.id } });
    if (!existing) throw new NotFoundException("No loyalty points redeemed on this order");

    // reverseRedemption is best-effort internally (so a void is never blocked by it) — here, a
    // direct cashier action, we verify it actually ran rather than silently reporting success.
    await this.loyalty.reverseRedemption(organizationId, order.id);
    const stillRedeemed = await this.prisma.loyaltyRedemption.findUnique({ where: { orderId: order.id } });
    if (stillRedeemed) throw new ConflictException("Failed to reverse the loyalty point redemption — try again");

    await this.prisma.order.update({
      where: { id: order.id },
      data: { loyaltyPointsRedeemed: 0, loyaltyDiscountAmount: new Decimal(0) },
    });
    await this.recalculateTotals(order.id);
    return this.findOne(organizationId, order.id);
  }

  /** Records a payment and closes the order once payments cover the total. */
  async addPayment(organizationId: string, orderId: string, dto: AddPaymentDto) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const activeItemCount = await this.prisma.orderItem.count({ where: { orderId: order.id, status: "ACTIVE" } });
    if (activeItemCount === 0) {
      throw new BadRequestException("Cannot take payment on an order with no items");
    }

    await this.prisma.payment.create({
      data: { orderId: order.id, method: dto.method, amount: dto.amount, referenceNumber: dto.referenceNumber },
    });

    const payments = await this.prisma.payment.findMany({ where: { orderId: order.id } });
    const totalPaid = payments.reduce((sum, p) => sum.add(p.amount), new Decimal(0));

    if (totalPaid.gte(order.total)) {
      // Atomic OPEN -> PAID claim: under concurrent addPayment calls that both observe
      // totalPaid >= total, only the request whose updateMany actually flips the row
      // (count === 1) accrues loyalty points and sends the confirmation, so a double-submit
      // can't double-credit or double-notify.
      const claimed = await this.prisma.order.updateMany({
        where: { id: order.id, status: "OPEN" },
        data: { status: "PAID", closedAt: new Date() },
      });
      if (claimed.count === 1) {
        if (order.customerId) {
          await this.loyalty.earnPoints(organizationId, order.customerId, order.total, order.id, order.outlet.brandId);
          await this.loyalty.grantReferralBonusIfEligible(organizationId, order.customerId, order.id);
          await this.campaigns.recordConversionIfAny(organizationId, order.customerId, order.id, order.total);
        }
        const fullOrder = await this.findOne(organizationId, order.id);
        // Best-effort — sendOrderConfirmation never throws, so a notification-provider outage
        // can't block a payment the cashier has already taken.
        await this.communications.sendOrderConfirmation(organizationId, fullOrder);
        return fullOrder;
      }
    }

    return this.findOne(organizationId, order.id);
  }

  /** Voiding is only allowed before any payment is taken — a paid order needs a refund flow, not a void. */
  async voidOrder(organizationId: string, orderId: string) {
    const order = await this.assertOpenOrder(organizationId, orderId);
    const paymentCount = await this.prisma.payment.count({ where: { orderId: order.id } });
    if (paymentCount > 0) {
      throw new ConflictException("Cannot void an order that already has payments recorded");
    }

    const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id, status: "ACTIVE" } });
    await Promise.all(
      items.map(async (item) => {
        await this.prisma.orderItem.update({ where: { id: item.id }, data: { status: "VOIDED" } });
        await this.kds.cancelTicketForOrderItem(organizationId, item.id);
        await this.inventory.reverseForOrderItem(organizationId, item.id);
      }),
    );

    // Best-effort — a void must never be blocked by loyalty bookkeeping.
    await this.loyalty.reverseRedemption(organizationId, order.id);
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: "VOIDED", closedAt: new Date(), loyaltyPointsRedeemed: 0, loyaltyDiscountAmount: new Decimal(0) },
    });
    const fullOrder = await this.findOne(organizationId, order.id);
    await this.communications.sendOrderStatusNotification(organizationId, fullOrder);
    return fullOrder;
  }

  /** Re-derives subtotal/taxTotal from active lines, then re-clamps discountAmount and
   *  loyaltyDiscountAmount (in that order) so total never goes negative — e.g. a flat discount
   *  or a points redemption that now exceeds the subtotal because items were voided afterwards. */
  private async recalculateTotals(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const items = await this.prisma.orderItem.findMany({ where: { orderId, status: "ACTIVE" } });
    const subtotal = items.reduce((sum, i) => sum.add(i.lineSubtotal), new Decimal(0));
    const taxTotal = items.reduce((sum, i) => sum.add(i.taxAmount), new Decimal(0));
    const billBeforeDiscounts = subtotal.add(taxTotal);
    const discountAmount = Decimal.min(order.discountAmount, billBeforeDiscounts);
    const remainingAfterPromotion = billBeforeDiscounts.sub(discountAmount);
    const loyaltyDiscountAmount = Decimal.min(order.loyaltyDiscountAmount, remainingAfterPromotion);
    const total = remainingAfterPromotion.sub(loyaltyDiscountAmount);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { subtotal, taxTotal, discountAmount, loyaltyDiscountAmount, total },
    });
  }

  private async assertOpenOrder(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId }, include: { outlet: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "OPEN") throw new ConflictException(`Order is ${order.status.toLowerCase()}, not open`);
    return order;
  }

  private async assertCustomerBelongsToOrg(organizationId: string, customerId: string) {
    await assertBelongsToOrg(
      () => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }),
      "Customer",
    );
  }
}
