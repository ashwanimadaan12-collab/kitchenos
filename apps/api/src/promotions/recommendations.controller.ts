import { Controller, Get, Param, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { PromotionRecommendationsService } from "./recommendations.service.js";

@Controller({ path: "promotions/recommendations", version: "1" })
@RequirePermissions(PERMISSIONS.PROMOTION_VIEW)
export class PromotionRecommendationsController {
  constructor(private readonly recommendations: PromotionRecommendationsService) {}

  @Get("discount-candidates")
  async discountCandidates(@CurrentUser() user: RequestUser, @Query("limit") limit?: string) {
    return this.recommendations.discountCandidates(requireOrganizationId(user), limit ? Number(limit) : undefined);
  }

  @Get("combo-candidates")
  async comboPromotionCandidates(@CurrentUser() user: RequestUser, @Query("limit") limit?: string) {
    return this.recommendations.comboPromotionCandidates(requireOrganizationId(user), limit ? Number(limit) : undefined);
  }

  @Get("segment-candidates")
  async segmentTargetingCandidates(@CurrentUser() user: RequestUser) {
    return this.recommendations.segmentTargetingCandidates(requireOrganizationId(user));
  }

  @Get("campaign-results")
  async campaignResults(@CurrentUser() user: RequestUser) {
    return this.recommendations.campaignResults(requireOrganizationId(user));
  }

  @Get("minimum-price/:variantId")
  async minimumProfitableSellingPrice(@CurrentUser() user: RequestUser, @Param("variantId") variantId: string) {
    return this.recommendations.minimumProfitableSellingPrice(requireOrganizationId(user), variantId);
  }
}
