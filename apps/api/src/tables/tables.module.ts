import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { TablesController } from "./tables.controller.js";
import { PublicTablesController } from "./public-tables.controller.js";
import { TablesService } from "./tables.service.js";

@Module({
  imports: [OrdersModule, AuditModule],
  controllers: [TablesController, PublicTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
