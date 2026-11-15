import { Module } from "@nestjs/common";
import { LoyaltyModule } from "../loyalty/loyalty.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";

@Module({
  imports: [LoyaltyModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CrmModule {}
