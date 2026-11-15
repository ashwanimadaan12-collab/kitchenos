import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { PurchaseOrdersService } from "./purchase-orders.service.js";
import { createPurchaseOrderSchema, type CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto.js";
import {
  receivePurchaseOrderItemSchema,
  type ReceivePurchaseOrderItemDto,
} from "./dto/receive-purchase-order-item.dto.js";

@Controller({ path: "purchase-orders", version: "1" })
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query("kitchenId") kitchenId?: string,
    @Query("supplierId") supplierId?: string,
    @Query("status") status?: string,
  ) {
    return this.purchaseOrders.list(requireOrganizationId(user), kitchenId, supplierId, status);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.purchaseOrders.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createPurchaseOrderSchema)) dto: CreatePurchaseOrderDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const po = await this.purchaseOrders.create(organizationId, user.userId, dto);
    await this.audit.log({
      action: "purchase_order.create",
      entityType: "PurchaseOrder",
      entityId: po.id,
      organizationId,
      userId: user.userId,
      metadata: { supplierId: dto.supplierId, kitchenId: dto.kitchenId, orderNumber: po.orderNumber },
    });
    return po;
  }

  @Post(":id/submit")
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_MANAGE)
  async submit(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const po = await this.purchaseOrders.submit(organizationId, id);
    await this.audit.log({
      action: "purchase_order.submit",
      entityType: "PurchaseOrder",
      entityId: po.id,
      organizationId,
      userId: user.userId,
    });
    return po;
  }

  @Post(":id/items/:itemId/receive")
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_MANAGE)
  async receiveItem(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(receivePurchaseOrderItemSchema)) dto: ReceivePurchaseOrderItemDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const po = await this.purchaseOrders.receiveItem(organizationId, id, itemId, dto);
    await this.audit.log({
      action: "purchase_order.item.receive",
      entityType: "PurchaseOrder",
      entityId: po.id,
      organizationId,
      userId: user.userId,
      metadata: { itemId, quantity: dto.quantity },
    });
    return po;
  }

  @Post(":id/cancel")
  @RequirePermissions(PERMISSIONS.PURCHASE_ORDER_MANAGE)
  async cancel(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const po = await this.purchaseOrders.cancel(organizationId, id);
    await this.audit.log({
      action: "purchase_order.cancel",
      entityType: "PurchaseOrder",
      entityId: po.id,
      organizationId,
      userId: user.userId,
    });
    return po;
  }
}
