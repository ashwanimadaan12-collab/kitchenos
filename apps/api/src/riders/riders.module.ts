import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { RidersController } from "./riders.controller.js";
import { RidersService } from "./riders.service.js";

@Module({
  imports: [AuditModule],
  controllers: [RidersController],
  providers: [RidersService],
  exports: [RidersService],
})
export class RidersModule {}
