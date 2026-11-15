import { Module } from "@nestjs/common";
import { CostingModule } from "../costing/costing.module.js";
import { PricingModule } from "../pricing/pricing.module.js";
import { CampaignsModule } from "../campaigns/campaigns.module.js";
import { PromotionsController } from "./promotions.controller.js";
import { PromotionsService } from "./promotions.service.js";
import { PromotionRecommendationsController } from "./recommendations.controller.js";
import { PromotionRecommendationsService } from "./recommendations.service.js";

@Module({
  imports: [CostingModule, PricingModule, CampaignsModule],
  controllers: [PromotionsController, PromotionRecommendationsController],
  providers: [PromotionsService, PromotionRecommendationsService],
  exports: [PromotionsService, PromotionRecommendationsService],
})
export class PromotionsModule {}
