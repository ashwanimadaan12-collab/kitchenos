import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";
import { ForecastingService } from "./forecasting.service.js";

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ForecastingService],
  exports: [InventoryService, ForecastingService],
})
export class InventoryModule {}
