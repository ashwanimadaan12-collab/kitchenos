import { Module } from "@nestjs/common";
import { LoyaltyController } from "./loyalty.controller.js";
import { CustomerLoyaltyController } from "./customer-loyalty.controller.js";
import { LoyaltyService } from "./loyalty.service.js";

@Module({
  controllers: [LoyaltyController, CustomerLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
