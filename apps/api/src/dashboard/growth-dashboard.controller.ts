import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { GrowthDashboardService } from "./growth-dashboard.service.js";
import { growthDashboardFilterSchema, type GrowthDashboardFilterDto } from "./dto/growth-dashboard-filter.dto.js";

/** Read-only, like ReportsController — no audit logging (nothing is mutated here). */
@Controller({ path: "dashboard", version: "1" })
@RequirePermissions(PERMISSIONS.REPORT_VIEW)
export class GrowthDashboardController {
  constructor(private readonly dashboard: GrowthDashboardService) {}

  @Get("growth")
  async getGrowthDashboard(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(growthDashboardFilterSchema)) filters: GrowthDashboardFilterDto,
  ) {
    return this.dashboard.getDashboard(requireOrganizationId(user), filters);
  }
}
