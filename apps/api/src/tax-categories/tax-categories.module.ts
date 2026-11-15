import { Module } from "@nestjs/common";
import { TaxCategoriesController } from "./tax-categories.controller.js";
import { TaxCategoriesService } from "./tax-categories.service.js";

@Module({
  controllers: [TaxCategoriesController],
  providers: [TaxCategoriesService],
  exports: [TaxCategoriesService],
})
export class TaxCategoriesModule {}
