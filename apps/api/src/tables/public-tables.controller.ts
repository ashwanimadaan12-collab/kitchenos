import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AuditService } from "../audit/audit.service.js";
import { TablesService } from "./tables.service.js";
import { placeTableOrderSchema, type PlaceTableOrderDto } from "./dto/place-table-order.dto.js";

/**
 * Unauthenticated by design — a customer who scanned a table's QR code has no account and never
 * will. `qrToken` is the entire authorization model (see TablesService). Both routes carry a
 * tighter throttle than the global default, since there's no logged-in user's own rate limit
 * backing these up the way there is everywhere else in the API.
 */
@Controller({ path: "public/tables", version: "1" })
@Public()
export class PublicTablesController {
  constructor(
    private readonly tables: TablesService,
    private readonly audit: AuditService,
  ) {}

  @Get(":qrToken")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async getMenu(@Param("qrToken") qrToken: string) {
    return this.tables.getPublicMenu(qrToken);
  }

  @Post(":qrToken/order")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async placeOrder(
    @Param("qrToken") qrToken: string,
    @Body(new ZodValidationPipe(placeTableOrderSchema)) dto: PlaceTableOrderDto,
  ) {
    const order = await this.tables.placeOrder(qrToken, dto);
    await this.audit.log({
      action: "table.public_order",
      entityType: "Order",
      entityId: order.id,
      organizationId: order.organizationId,
      metadata: { tableId: order.tableId, itemCount: dto.items.length },
    });
    return order;
  }
}
