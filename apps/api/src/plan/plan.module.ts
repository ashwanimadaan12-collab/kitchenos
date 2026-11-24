import { Global, Module } from "@nestjs/common";
import { PlanService } from "./plan.service.js";

/** Global so any feature module can enforce limits without importing a module. */
@Global()
@Module({
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
