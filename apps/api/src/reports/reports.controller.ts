import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { ReportsService } from "./reports.service.js";
import { reportFilterSchema, type ReportFilterDto } from "./dto/report-filter.dto.js";
import { topProductsFilterSchema, type TopProductsFilterDto } from "./dto/top-products-filter.dto.js";

@Controller({ path: "reports", version: "1" })
@RequirePermissions(PERMISSIONS.REPORT_VIEW)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("sales-summary")
  async salesSummary(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.salesSummary(requireOrganizationId(user), filters);
  }

  @Get("sales-by-day")
  async salesByDay(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.salesByDay(requireOrganizationId(user), filters);
  }

  @Get("top-products")
  async topProducts(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(topProductsFilterSchema)) filters: TopProductsFilterDto,
  ) {
    return this.reports.topProducts(requireOrganizationId(user), filters);
  }

  @Get("combo-performance")
  async comboPerformance(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.comboPerformance(requireOrganizationId(user), filters);
  }

  @Get("profit-loss")
  async profitLoss(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.profitLoss(requireOrganizationId(user), filters);
  }

  @Get("payment-methods")
  async paymentMethods(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.paymentMethods(requireOrganizationId(user), filters);
  }

  @Get("promotions")
  async promotionUsage(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.promotionUsage(requireOrganizationId(user), filters);
  }

  @Get("weekday-distribution")
  async weekdayDistribution(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.weekdayDistribution(requireOrganizationId(user), filters);
  }

  @Get("hourly-distribution")
  async hourlyDistribution(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.hourlyDistribution(requireOrganizationId(user), filters);
  }

  @Get("demand-heatmap")
  async demandHeatmap(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.demandHeatmap(requireOrganizationId(user), filters);
  }

  @Get("peak-slow-hours")
  async peakAndSlowHours(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.peakAndSlowHours(requireOrganizationId(user), filters);
  }

  @Get("monthly-trend")
  async monthlyTrend(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.monthlyTrend(requireOrganizationId(user), filters);
  }

  @Get("brand-demand")
  async brandDemand(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.brandDemand(requireOrganizationId(user), filters);
  }

  @Get("outlet-demand")
  async outletDemand(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.outletDemand(requireOrganizationId(user), filters);
  }

  @Get("channel-demand")
  async channelDemand(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.channelDemand(requireOrganizationId(user), filters);
  }

  @Get("promotion-recommendations")
  async promotionRecommendations(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(reportFilterSchema)) filters: ReportFilterDto,
  ) {
    return this.reports.promotionRecommendations(requireOrganizationId(user), filters);
  }
}
