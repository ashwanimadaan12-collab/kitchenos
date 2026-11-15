import { Module } from "@nestjs/common";
import { KdsModule } from "../kds/kds.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PromotionsModule } from "../promotions/promotions.module.js";
import { CommunicationsModule } from "../communications/communications.module.js";
import { LoyaltyModule } from "../loyalty/loyalty.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PricingModule } from "../pricing/pricing.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [
    KdsModule,
    InventoryModule,
    PromotionsModule,
    CommunicationsModule,
    LoyaltyModule,
    CampaignsModule,
    PricingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
