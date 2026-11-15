import { Module } from "@nestjs/common";
import { CostingModule } from "../costing/costing.module.js";
import { PricingController } from "./pricing.controller.js";
import { PricingService } from "./pricing.service.js";
import { PricingRulesController } from "./pricing-rules.controller.js";
import { PricingRulesService } from "./pricing-rules.service.js";

@Module({
  imports: [CostingModule],
  controllers: [PricingController, PricingRulesController],
  providers: [PricingService, PricingRulesService],
  exports: [PricingService, PricingRulesService],
})
export class PricingModule {}
