import { Module } from "@nestjs/common";
import { CostingModule } from "../costing/costing.module.js";
import { KitchensModule } from "../kitchens/kitchens.module.js";
import { LoyaltyModule } from "../loyalty/loyalty.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PromotionsModule } from "../promotions/promotions.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { GrowthDashboardController } from "./growth-dashboard.controller.js";
import { GrowthDashboardService } from "./growth-dashboard.service.js";

/**
 * A terminal consumer only ever imported by AppModule — never by another business module — so
 * importing all six of these leaf modules at once introduces no circular-dependency risk.
 */
@Module({
  imports: [CostingModule, KitchensModule, LoyaltyModule, CampaignsModule, InventoryModule, PromotionsModule, ReportsModule],
  controllers: [GrowthDashboardController],
  providers: [GrowthDashboardService],
})
export class DashboardModule {}
