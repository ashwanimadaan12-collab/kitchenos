import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CostingService } from "../costing/costing.service.js";
import { PricingRulesService } from "../pricing/pricing-rules.service.js";
import { CampaignsService } from "../campaigns/campaigns.service.js";
import { SegmentsService } from "../campaigns/segments.service.js";
import { computeMinimumProfitablePrice, resolveVariantCost } from "../common/utils/resolve-variant-cost.util.js";

const { Decimal } = Prisma;
const LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEALTHY_MARGIN_PERCENT = 30; // candidates need at least this much headroom before discounting.
const SUGGESTED_DISCOUNT_PERCENT = 15; // a conservative starting point, always re-checked against the margin floor.

/**
 * A promotion-optimization layer (Prompt 19) that is almost entirely reuse, not new analysis:
 * slow days/time slots already live in Prompt 17's ReportsService.promotionRecommendations;
 * customer segments already live in Prompt 15's SegmentsService; campaign results already live
 * in Prompt 15's CampaignsService.getStats; and the minimum profitable price already lives in
 * Prompt 16's margin-floor formula. The only genuinely new analysis here is ranking products
 * and combos as discount/promotion candidates by demand + margin, and rolling campaign history
 * up into one ranked view.
 */
@Injectable()
export class PromotionRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly pricingRules: PricingRulesService,
    private readonly campaigns: CampaignsService,
    private readonly segments: SegmentsService,
  ) {}

  /**
   * Ranks active variants as discount candidates: a healthy-margin product selling slowly is a
   * much better discount candidate than a thin-margin one selling slowly (discounting the
   * latter would erode what little contribution it has) — the same contribution-aware stance
   * Prompt 17's time-slot recommendations already take, applied to products instead of slots.
   * `suggestedDiscountPercent` is always re-checked against the configured margin floor, so it
   * can never itself recommend an unsafe price.
   */
  async discountCandidates(organizationId: string, limit = 10) {
    const [variants, settings] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { isActive: true, product: { organizationId, isActive: true } },
        include: { product: { select: { name: true } } },
      }),
      this.pricingRules.getSettings(organizationId),
    ]);

    const from = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { status: "ACTIVE", order: { organizationId, status: "PAID", closedAt: { gte: from } } },
      _sum: { quantity: true },
    });
    const quantitySoldByVariant = new Map(grouped.map((g) => [g.variantId, g._sum.quantity ?? 0]));

    const candidates = await Promise.all(
      variants.map(async (variant) => {
        const cost = await resolveVariantCost(this.costing, organizationId, variant);
        const quantitySold = quantitySoldByVariant.get(variant.id) ?? 0;
        const marginPercent = cost !== null && variant.basePrice.gt(0) ? variant.basePrice.sub(cost).div(variant.basePrice).mul(100) : null;
        const minimumProfitablePrice = cost !== null ? computeMinimumProfitablePrice(cost, settings.minimumMarginPercent) : null;

        let suggestedDiscountPercent: number | null = null;
        if (marginPercent !== null && marginPercent.gte(HEALTHY_MARGIN_PERCENT)) {
          const candidatePrice = variant.basePrice.mul(new Decimal(1).sub(SUGGESTED_DISCOUNT_PERCENT / 100));
          // Shrink the suggestion to whatever the margin floor actually allows, rather than
          // recommending a number and then separately warning it's unsafe.
          suggestedDiscountPercent =
            minimumProfitablePrice === null || candidatePrice.gte(minimumProfitablePrice)
              ? SUGGESTED_DISCOUNT_PERCENT
              : Number(new Decimal(100).sub(minimumProfitablePrice.div(variant.basePrice).mul(100)).toDecimalPlaces(1));
        }

        return {
          variantId: variant.id,
          productName: variant.product.name,
          variantName: variant.name,
          basePrice: variant.basePrice,
          quantitySoldLast90Days: quantitySold,
          cost,
          marginPercent: marginPercent?.toDecimalPlaces(1) ?? null,
          minimumProfitablePrice: minimumProfitablePrice?.toDecimalPlaces(2) ?? null,
          suggestedDiscountPercent,
          isCandidate: marginPercent !== null && marginPercent.gte(HEALTHY_MARGIN_PERCENT),
        };
      }),
    );

    return candidates
      .filter((c) => c.isCandidate)
      .sort((a, b) => a.quantitySoldLast90Days - b.quantitySoldLast90Days)
      .slice(0, limit);
  }

  /** Underperforming combos (few instances sold in the last 90 days) worth promoting —
   *  combo pricing already bakes in its own margin decision at creation time, so this ranks by
   *  volume alone rather than re-deriving a margin from component costs. */
  async comboPromotionCandidates(organizationId: string, limit = 10) {
    const from = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
    const combos = await this.prisma.combo.findMany({ where: { organizationId, isActive: true } });

    const rows = await this.prisma.orderItem.groupBy({
      by: ["comboId", "comboInstanceId"],
      where: {
        status: "ACTIVE",
        comboId: { not: null },
        order: { organizationId, status: "PAID", closedAt: { gte: from } },
      },
      _sum: { lineSubtotal: true },
    });
    const byCombo = new Map<string, { instancesSold: number; revenue: Prisma.Decimal }>();
    for (const row of rows) {
      const comboId = row.comboId as string;
      const entry = byCombo.get(comboId) ?? { instancesSold: 0, revenue: new Decimal(0) };
      entry.instancesSold += 1;
      entry.revenue = entry.revenue.add(row._sum.lineSubtotal ?? new Decimal(0));
      byCombo.set(comboId, entry);
    }

    return combos
      .map((combo) => {
        const stats = byCombo.get(combo.id) ?? { instancesSold: 0, revenue: new Decimal(0) };
        return {
          comboId: combo.id,
          name: combo.name,
          comboPrice: combo.comboPrice,
          instancesSoldLast90Days: stats.instancesSold,
          revenueLast90Days: stats.revenue,
        };
      })
      .sort((a, b) => a.instancesSoldLast90Days - b.instancesSoldLast90Days)
      .slice(0, limit);
  }

  /** Which customer segments are the best targeting candidates right now — an INACTIVE
   *  segment is, by construction, customers who've drifted away and a promotion is most
   *  likely to bring back; every segment's current resolved size is shown for context. */
  async segmentTargetingCandidates(organizationId: string) {
    const customerSegments = await this.segments.list(organizationId);
    const withSize = await Promise.all(
      customerSegments.map(async (segment) => {
        const customerIds = await this.segments.resolveCustomerIds(organizationId, segment);
        return {
          segmentId: segment.id,
          name: segment.name,
          type: segment.type,
          customerCount: customerIds.length,
          recommended: segment.type === "INACTIVE",
        };
      }),
    );
    return withSize.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.customerCount - a.customerCount);
  }

  /** Every campaign's own stats, ranked by conversion rate — "historical campaign results." */
  async campaignResults(organizationId: string) {
    const allCampaigns = await this.campaigns.list(organizationId, {});
    const withStats = await Promise.all(
      allCampaigns
        .filter((c) => c.status === "COMPLETED" || c.status === "RUNNING")
        .map(async (c) => ({ campaignId: c.id, name: c.name, type: c.type, status: c.status, stats: await this.campaigns.getStats(organizationId, c.id) })),
    );
    return withStats.sort((a, b) => b.stats.conversionRate - a.stats.conversionRate);
  }

  /** The minimum price that respects the org's configured margin safeguard for this variant —
   *  the same formula the pricing engine's margin floor and rule-creation safeguard both use. */
  async minimumProfitableSellingPrice(organizationId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, product: { organizationId } } });
    if (!variant) throw new NotFoundException("Product variant not found");
    const [cost, settings] = await Promise.all([
      resolveVariantCost(this.costing, organizationId, variant),
      this.pricingRules.getSettings(organizationId),
    ]);
    const minimumProfitablePrice = cost !== null ? computeMinimumProfitablePrice(cost, settings.minimumMarginPercent) : null;
    return {
      variantId: variant.id,
      basePrice: variant.basePrice,
      cost,
      minimumMarginPercent: settings.minimumMarginPercent,
      minimumProfitablePrice: minimumProfitablePrice?.toDecimalPlaces(2) ?? null,
    };
  }
}
