import { Prisma } from "@kitchenos/database";
import type { CostingService } from "../../costing/costing.service.js";

const { Decimal } = Prisma;

export interface CostableVariant {
  id: string;
  kind: "PREPARED_FOOD" | "RETAIL_COMMODITY";
  landedCost: Prisma.Decimal | null;
  purchasePrice: Prisma.Decimal | null;
}

/**
 * PREPARED_FOOD variants cost from their Recipe (CostingService, Prompt 07); RETAIL_COMMODITY
 * variants cost from their own landed/purchase cost fields (Prompt 16) — the one dual cost
 * source shared by every feature that needs a per-unit cost estimate (pricing quotes, demand-
 * analytics contribution, promotion recommendations) instead of each re-implementing it.
 * Returns null when cost can't be determined (no recipe costed yet, no purchase price set) —
 * never throws, since "unknown" means a caller can't protect/measure against it, not that the
 * whole operation should fail.
 */
export async function resolveVariantCost(
  costing: CostingService,
  organizationId: string,
  variant: CostableVariant,
  outletId?: string,
): Promise<Prisma.Decimal | null> {
  if (variant.kind === "RETAIL_COMMODITY") {
    return variant.landedCost ?? variant.purchasePrice ?? null;
  }
  try {
    const breakdown = await costing.computeVariantCost(organizationId, variant.id, outletId);
    return breakdown.missingCostIngredientIds.length > 0 ? null : breakdown.costPerYieldUnit;
  } catch {
    return null;
  }
}

/** cost / (1 - minimumMarginPercent/100) — the price floor a minimum-margin safeguard implies.
 *  Null when cost is unknown or the margin is configured at/above 100% (undefined floor). */
export function computeMinimumProfitablePrice(cost: Prisma.Decimal, minimumMarginPercent: Prisma.Decimal): Prisma.Decimal | null {
  const marginFraction = minimumMarginPercent.div(100);
  if (marginFraction.gte(1)) return null;
  return cost.div(new Decimal(1).sub(marginFraction));
}
