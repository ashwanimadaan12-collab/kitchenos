import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module.js";
import { SegmentsController } from "./segments.controller.js";
import { SegmentsService } from "./segments.service.js";
import { CampaignsController } from "./campaigns.controller.js";
import { CampaignsService } from "./campaigns.service.js";

@Module({
  imports: [CommunicationsModule],
  controllers: [SegmentsController, CampaignsController],
  providers: [SegmentsService, CampaignsService],
  exports: [SegmentsService, CampaignsService],
})
export class CampaignsModule {}
