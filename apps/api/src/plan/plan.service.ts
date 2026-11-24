import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import {
  FEATURE_LABEL,
  cheapestPlanWith,
  getPlan,
  hasFeature,
  isTrialActive,
  isWithinLimit,
  type Feature,
  type PlanContext,
  type PlanLimits,
} from "@kitchenos/shared";

/**
 * The one place that decides what a workspace is allowed to do.
 *
 * Plans themselves — their prices, limits and feature lists — are the shared
 * PLANS table, so changing what Pro includes never touches this file or the
 * database. This only looks up which tier an organization is on and applies it.
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async context(organizationId: string): Promise<PlanContext> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true, trialEndsAt: true },
    });
    return { planId: org?.plan ?? null, trialEndsAt: org?.trialEndsAt ?? null };
  }

  async isTrialing(organizationId: string): Promise<boolean> {
    return isTrialActive((await this.context(organizationId)).trialEndsAt);
  }

  /** Throws unless the plan (or an active trial) includes the feature. The message
   *  names the cheapest plan that does, so the UI never has to work that out. */
  async assertFeature(organizationId: string, feature: Feature): Promise<void> {
    const ctx = await this.context(organizationId);
    if (hasFeature(ctx, feature)) return;

    const needed = cheapestPlanWith(feature);
    const label = FEATURE_LABEL[feature];
    throw new ForbiddenException(
      needed
        ? `${label} aapke ${getPlan(ctx.planId).name} plan me nahi hai. ${needed.name} plan (₹${needed.pricePerYear.toLocaleString("en-IN")}/saal) me milta hai.`
        : `${label} is plan me nahi hai.`,
    );
  }

  /**
   * Throws if adding one more would pass the plan's limit. `current` is the
   * count before the new one, so a plan allowing 1 outlet refuses at current = 1.
   */
  async assertWithinLimit(
    organizationId: string,
    limit: keyof PlanLimits,
    current: number,
    whatToAdd: string,
  ): Promise<void> {
    const ctx = await this.context(organizationId);
    if (isWithinLimit(ctx, limit, current)) return;

    const plan = getPlan(ctx.planId);
    throw new ForbiddenException(
      `${plan.name} plan me ${plan.limits[limit]} tak ${whatToAdd} hi ho sakte hain. Aur chahiye to plan upgrade karo.`,
    );
  }
}
