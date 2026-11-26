import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { OrdersService } from "./orders.service.js";
import { createOrderSchema, type CreateOrderDto } from "./dto/create-order.dto.js";
import { addOrderItemSchema, type AddOrderItemDto } from "./dto/add-order-item.dto.js";
import { updateOrderItemSchema, type UpdateOrderItemDto } from "./dto/update-order-item.dto.js";
import { addPaymentSchema, type AddPaymentDto } from "./dto/add-payment.dto.js";
import { addComboOrderItemSchema, type AddComboOrderItemDto } from "./dto/add-combo-order-item.dto.js";
import { applyPromotionSchema, type ApplyPromotionDto } from "./dto/apply-promotion.dto.js";
import { assignCustomerToOrderSchema, type AssignCustomerToOrderDto } from "./dto/assign-customer-to-order.dto.js";
import { redeemLoyaltyPointsSchema, type RedeemLoyaltyPointsDto } from "./dto/redeem-loyalty-points.dto.js";
import { syncOfflineOrderSchema, type SyncOfflineOrderDto } from "./dto/sync-offline-order.dto.js";
import { advanceFulfillmentSchema, type AdvanceFulfillmentDto } from "./dto/advance-fulfillment.dto.js";

@Controller({ path: "orders", version: "1" })
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query("outletId") outletId?: string,
    @Query("status") status?: string,
    @Query("fulfillment") fulfillment?: string,
  ) {
    return this.orders.list(requireOrganizationId(user), outletId, status, fulfillment?.split(","));
  }

  /** Declared before `:id` so Nest does not read "in-flight" as an order id. */
  @Get("in-flight")
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  async listInFlight(@CurrentUser() user: RequestUser, @Query("outletId") outletId?: string) {
    return this.orders.listInFlight(requireOrganizationId(user), outletId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.orders.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.create(organizationId, user.userId, dto);
    await this.audit.log({
      action: "order.create",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { outletId: dto.outletId, channel: dto.channel, orderNumber: order.orderNumber },
    });
    return order;
  }

  /** Replays an order the POS took offline. See `syncOfflineOrderSchema` for the (deliberately
   *  narrow) scope. Needs both order- and payment-management permission since it does the work
   *  of both `create` and `addPayment` in one call. */
  @Post("sync-offline")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE, PERMISSIONS.PAYMENT_MANAGE)
  async syncOfflineOrder(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(syncOfflineOrderSchema)) dto: SyncOfflineOrderDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.syncOfflineOrder(organizationId, user.userId, dto);
    await this.audit.log({
      action: "order.sync_offline",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { clientOrderId: dto.clientOrderId, outletId: dto.outletId, itemCount: dto.items.length },
    });
    return order;
  }

  @Post(":id/items")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async addItem(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(addOrderItemSchema)) dto: AddOrderItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.addItem(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.item.add",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { variantId: dto.variantId, quantity: dto.quantity },
    });
    return order;
  }

  @Patch(":id/items/:itemId")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async updateItem(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateOrderItemSchema)) dto: UpdateOrderItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.updateItemQuantity(organizationId, orderId, itemId, dto);
    await this.audit.log({
      action: "order.item.update",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { itemId, quantity: dto.quantity },
    });
    return order;
  }

  @Delete(":id/items/:itemId")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async removeItem(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Param("itemId") itemId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removeItem(organizationId, orderId, itemId);
    await this.audit.log({
      action: "order.item.void",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { itemId },
    });
    return order;
  }

  @Post(":id/combo-items")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async addComboItem(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(addComboOrderItemSchema)) dto: AddComboOrderItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.addComboItem(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.combo_item.add",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { comboId: dto.comboId, quantity: dto.quantity },
    });
    return order;
  }

  @Delete(":id/combo-items/:comboInstanceId")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async removeComboItem(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Param("comboInstanceId") comboInstanceId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removeComboItem(organizationId, orderId, comboInstanceId);
    await this.audit.log({
      action: "order.combo_item.void",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { comboInstanceId },
    });
    return order;
  }

  @Post(":id/promotion")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async applyPromotion(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(applyPromotionSchema)) dto: ApplyPromotionDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.applyPromotion(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.promotion.apply",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { code: dto.code, discountAmount: order.discountAmount.toString() },
    });
    return order;
  }

  @Delete(":id/promotion")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async removePromotion(@CurrentUser() user: RequestUser, @Param("id") orderId: string) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removePromotion(organizationId, orderId);
    await this.audit.log({
      action: "order.promotion.remove",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
    });
    return order;
  }

  @Post(":id/loyalty-redemption")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async redeemLoyaltyPoints(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(redeemLoyaltyPointsSchema)) dto: RedeemLoyaltyPointsDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.redeemLoyaltyPoints(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.loyalty_redemption.apply",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { points: dto.points, discountAmount: order.loyaltyDiscountAmount.toString() },
    });
    return order;
  }

  @Delete(":id/loyalty-redemption")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async removeLoyaltyRedemption(@CurrentUser() user: RequestUser, @Param("id") orderId: string) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removeLoyaltyRedemption(organizationId, orderId);
    await this.audit.log({
      action: "order.loyalty_redemption.remove",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
    });
    return order;
  }

  @Post(":id/customer")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async assignCustomer(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(assignCustomerToOrderSchema)) dto: AssignCustomerToOrderDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.assignCustomer(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.customer.assign",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { customerId: dto.customerId },
    });
    return order;
  }

  @Delete(":id/customer")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async removeCustomer(@CurrentUser() user: RequestUser, @Param("id") orderId: string) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removeCustomer(organizationId, orderId);
    await this.audit.log({
      action: "order.customer.remove",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
    });
    return order;
  }

  @Post(":id/payments")
  @RequirePermissions(PERMISSIONS.PAYMENT_MANAGE)
  async addPayment(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(addPaymentSchema)) dto: AddPaymentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.addPayment(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.payment.add",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { method: dto.method, amount: dto.amount },
    });
    return order;
  }

  @Post(":id/void")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async voidOrder(@CurrentUser() user: RequestUser, @Param("id") orderId: string) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.voidOrder(organizationId, orderId);
    await this.audit.log({
      action: "order.void",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
    });
    return order;
  }

  @Delete(":id/payments/:paymentId")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYMENT_MANAGE)
  async removePayment(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Param("paymentId") paymentId: string,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.removePayment(organizationId, orderId, paymentId);
    await this.audit.log({
      action: "order.payment.remove",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { paymentId },
    });
    return order;
  }

  @Patch(":id/fulfillment")
  @RequirePermissions(PERMISSIONS.ORDER_MANAGE)
  async advanceFulfillment(
    @CurrentUser() user: RequestUser,
    @Param("id") orderId: string,
    @Body(new ZodValidationPipe(advanceFulfillmentSchema)) dto: AdvanceFulfillmentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const order = await this.orders.advanceFulfillment(organizationId, orderId, dto);
    await this.audit.log({
      action: "order.fulfillment.advance",
      entityType: "Order",
      entityId: order.id,
      organizationId,
      userId: user.userId,
      metadata: { stage: dto.stage, riderId: dto.riderId ?? null },
    });
    return order;
  }
}
