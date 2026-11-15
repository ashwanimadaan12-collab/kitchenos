import { Module } from "@nestjs/common";
import { KitchensController } from "./kitchens.controller.js";
import { KitchensService } from "./kitchens.service.js";

@Module({
  controllers: [KitchensController],
  providers: [KitchensService],
  exports: [KitchensService],
})
export class KitchensModule {}
