import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService, type PricingRule, type ProductVariant } from "@kitchenos/database";
import type { CreatePricingRuleDto, PriceQuoteQueryDto, UpdatePricingRuleDto, UpdatePricingSettingsDto } from "@kitchenos/shared";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import { CostingService } from "../costing/costing.service.js";
import { computeMinimumProfitablePrice, resolveVariantCost } from "../common/utils/resolve-variant-cost.util.js";

const { Decimal } = Prisma;

export interface PriceQuote {
  variantId: string;
  outletId: string;
  channel: string;
  at: Date;
  finalPrice: Prisma.Decimal;
  selectedRule: {
    id: string;
    label: string;
    category: string;
    adjustmentType: string;
    adjustmentValue: Prisma.Decimal;
    priority: number;
  } | null;
  validity: { validFrom: Date | null; validTo: Date | null } | null;
  breakdown: {
    basePrice: Prisma.Decimal;
    outletOverride: Prisma.Decimal | null;
    resolvedBase: Prisma.Decimal;
    afterRule: Prisma.Decimal;
    mrpCeiling: Prisma.Decimal | null;
    mrpCapped: boolean;
    cost: Prisma.Decimal | null;
    minimumMarginPercent: Prisma.Decimal;
    marginFloorApplied: boolean;
  };
}

/**
 * The dynamic pricing engine (Prompt 16). One rule shape (PricingRule) with
 * fully optional/nullable match conditions covers every scenario in the
 * spec — midnight/weekend/festival time windows, channel-specific and
 * outlet-specific pricing, scheduled discounts, and manually-authored
 * demand-based promotions — rather than a special-cased rule type per
 * scenario. See quote() for the full resolution order: outlet override ->
 * most-specific matching rule -> MRP ceiling (retail commodities only) ->
 * minimum-margin floor (only when cost is known).
 */
@Injectable()
export class PricingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
  ) {}

  async listRules(organizationId: string, filters: { variantId?: string; outletId?: string }) {
    return this.prisma.pricingRule.findMany({
      where: {
        organizationId,
        ...(filters.variantId ? { variantId: filters.variantId } : {}),
        ...(filters.outletId ? { outletId: filters.outletId } : {}),
      },
      include: { variant: { select: { id: true, name: true } }, outlet: { select: { id: true, name: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async findRule(organizationId: string, id: string) {
    return assertBelongsToOrg(() => this.prisma.pricingRule.findFirst({ where: { id, organizationId } }), "Pricing rule");
  }

  async createRule(organizationId: string, dto: CreatePricingRuleDto) {
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({ where: { id: dto.variantId, product: { organizationId } } });
      if (!variant) throw new NotFoundException("Product variant not found");
    }
    if (dto.outletId) {
      const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outletId, organizationId } });
      if (!outlet) throw new NotFoundException("Outlet not found");
    }
    await this.assertMarginSafeguard(organizationId, dto.variantId, dto.adjustmentType, dto.adjustmentValue, dto.approvedOverride);
    return this.prisma.pricingRule.create({
      data: {
        organizationId,
        variantId: dto.variantId,
        outletId: dto.outletId,
        channel: dto.channel,
        category: dto.category,
        label: dto.label,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        adjustmentType: dto.adjustmentType,
        adjustmentValue: dto.adjustmentValue,
        priority: dto.priority,
      },
    });
  }

  async updateRule(organizationId: string, id: string, dto: UpdatePricingRuleDto) {
    const existing = await this.findRule(organizationId, id);
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({ where: { id: dto.variantId, product: { organizationId } } });
      if (!variant) throw new NotFoundException("Product variant not found");
    }
    if (dto.outletId) {
      const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outletId, organizationId } });
      if (!outlet) throw new NotFoundException("Outlet not found");
    }
    await this.assertMarginSafeguard(
      organizationId,
      dto.variantId ?? existing.variantId ?? undefined,
      dto.adjustmentType ?? existing.adjustmentType,
      dto.adjustmentValue ?? existing.adjustmentValue.toString(),
      dto.approvedOverride,
    );
    return this.prisma.pricingRule.update({
      where: { id },
      data: {
        variantId: dto.variantId,
        outletId: dto.outletId,
        channel: dto.channel,
        category: dto.category,
        label: dto.label,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        adjustmentType: dto.adjustmentType,
        adjustmentValue: dto.adjustmentValue,
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  // --------------------------------------------------------------- Settings

  async getSettings(organizationId: string) {
    const existing = await this.prisma.pricingSettings.findUnique({ where: { organizationId } });
    if (existing) return existing;
    try {
      return await this.prisma.pricingSettings.create({ data: { organizationId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return this.prisma.pricingSettings.findUniqueOrThrow({ where: { organizationId } });
      }
      throw err;
    }
  }

  async updateSettings(organizationId: string, dto: UpdatePricingSettingsDto) {
    await this.getSettings(organizationId);
    return this.prisma.pricingSettings.update({ where: { organizationId }, data: dto });
  }

  // ------------------------------------------------------------------ Quote

  /**
   * Every price quote returns the selected rule (if any), the final price,
   * that rule's validity window, and a full breakdown — the spec's own
   * requirement, and the only way a pricing decision is ever explainable
   * after the fact.
   */
  async quote(organizationId: string, dto: PriceQuoteQueryDto): Promise<PriceQuote> {
    const at = dto.at ?? new Date();
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { organizationId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found");
    const outlet = await assertBelongsToOrg(
      () => this.prisma.outlet.findFirst({ where: { id: dto.outletId, organizationId } }),
      "Outlet",
    );

    const override = await this.prisma.outletProductPrice.findFirst({
      where: { outletId: outlet.id, variantId: variant.id, isActive: true },
    });
    const resolvedBase = override?.price ?? variant.basePrice;

    const candidateRules = await this.prisma.pricingRule.findMany({
      where: { organizationId, isActive: true, OR: [{ variantId: variant.id }, { variantId: null }] },
    });
    const matching = candidateRules.filter((rule) => this.ruleMatches(rule, outlet.id, dto.channel, at));
    const selected = this.pickMostSpecific(matching);

    let afterRule = selected ? this.applyAdjustment(resolvedBase, selected) : resolvedBase;
    if (afterRule.lt(0)) afterRule = new Decimal(0);

    const mrpCeiling = variant.kind === "RETAIL_COMMODITY" ? variant.printedMRP : null;
    let finalPrice = afterRule;
    let mrpCapped = false;
    if (mrpCeiling && finalPrice.gt(mrpCeiling)) {
      finalPrice = mrpCeiling;
      mrpCapped = true;
    }

    const cost = await this.resolveCost(organizationId, variant, outlet.id);
    const settings = await this.getSettings(organizationId);
    let marginFloorApplied = false;
    if (cost !== null && settings.minimumMarginPercent.gt(0)) {
      const floor = computeMinimumProfitablePrice(cost, settings.minimumMarginPercent);
      if (floor !== null) {
        // The MRP ceiling is a legal constraint and always wins over the margin floor —
        // a true conflict (floor above MRP) surfaces as marginFloorApplied staying false
        // with finalPrice left at the MRP cap, visible in the breakdown either way.
        const flooredPrice = mrpCeiling ? Decimal.min(floor, mrpCeiling) : floor;
        if (finalPrice.lt(flooredPrice)) {
          finalPrice = flooredPrice;
          marginFloorApplied = true;
        }
      }
    }
    finalPrice = finalPrice.toDecimalPlaces(2);

    return {
      variantId: variant.id,
      outletId: outlet.id,
      channel: dto.channel,
      at,
      finalPrice,
      selectedRule: selected
        ? {
            id: selected.id,
            label: selected.label,
            category: selected.category,
            adjustmentType: selected.adjustmentType,
            adjustmentValue: selected.adjustmentValue,
            priority: selected.priority,
          }
        : null,
      validity: selected ? { validFrom: selected.validFrom, validTo: selected.validTo } : null,
      breakdown: {
        basePrice: variant.basePrice,
        outletOverride: override?.price ?? null,
        resolvedBase,
        afterRule,
        mrpCeiling,
        mrpCapped,
        cost,
        minimumMarginPercent: settings.minimumMarginPercent,
        marginFloorApplied,
      },
    };
  }

  private ruleMatches(rule: PricingRule, outletId: string, channel: string, at: Date): boolean {
    if (rule.outletId && rule.outletId !== outletId) return false;
    if (rule.channel && rule.channel !== channel) return false;
    if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(at.getUTCDay())) return false;
    if (rule.validFrom && at < rule.validFrom) return false;
    if (rule.validTo && at > rule.validTo) return false;
    if (rule.startTime || rule.endTime) {
      const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
      const start = rule.startTime ? this.toMinutes(rule.startTime) : 0;
      const end = rule.endTime ? this.toMinutes(rule.endTime) : 24 * 60;
      const inWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
      if (!inWindow) return false;
    }
    return true;
  }

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":");
    return Number(h) * 60 + Number(m);
  }

  /** More narrowly-scoped conditions win; ties break on explicit priority, then recency. */
  private pickMostSpecific(rules: PricingRule[]): PricingRule | null {
    if (rules.length === 0) return null;
    const specificity = (r: PricingRule): number =>
      Number(Boolean(r.variantId)) +
      Number(Boolean(r.outletId)) +
      Number(Boolean(r.channel)) +
      Number(r.daysOfWeek.length > 0) +
      Number(Boolean(r.startTime || r.endTime)) +
      Number(Boolean(r.validFrom || r.validTo));

    const sorted = [...rules].sort((a, b) => {
      const specDiff = specificity(b) - specificity(a);
      if (specDiff !== 0) return specDiff;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return sorted[0] ?? null;
  }

  private applyAdjustment(base: Prisma.Decimal, rule: PricingRule): Prisma.Decimal {
    switch (rule.adjustmentType) {
      case "FIXED_PRICE":
        return rule.adjustmentValue;
      case "PERCENT_DISCOUNT":
        return base.mul(new Decimal(1).sub(rule.adjustmentValue.div(100)));
      case "FLAT_DISCOUNT":
        return base.sub(rule.adjustmentValue);
      case "PERCENT_SURCHARGE":
        return base.mul(new Decimal(1).add(rule.adjustmentValue.div(100)));
      case "FLAT_SURCHARGE":
        return base.add(rule.adjustmentValue);
    }
  }

  /** PREPARED_FOOD costs from its Recipe (CostingService); RETAIL_COMMODITY from its own
   *  landed/purchase cost fields. Returns null when no cost is known yet — the margin floor
   *  simply can't protect what it can't measure, rather than blocking the quote. */
  private async resolveCost(organizationId: string, variant: ProductVariant, outletId: string): Promise<Prisma.Decimal | null> {
    return resolveVariantCost(this.costing, organizationId, variant, outletId);
  }

  /**
   * Prompt 19's margin safeguard: a single-variant rule that discounts below the org's
   * configured minimum-margin floor is rejected unless the caller explicitly sets
   * `approvedOverride` — "never apply a discount that violates the margin safeguard without
   * explicit authorized approval." Only checked when every input needed to know the resulting
   * price is known (a specific variant, a discount-shaped adjustment, a resolvable cost, and a
   * nonzero configured margin) — this is a static sanity check against the variant's own base
   * price, not a replacement for quote()'s full outlet/rule-stacking resolution.
   */
  private async assertMarginSafeguard(
    organizationId: string,
    variantId: string | undefined,
    adjustmentType: string | undefined,
    adjustmentValue: string | undefined,
    approvedOverride: boolean | undefined,
  ): Promise<void> {
    if (!variantId || !adjustmentType || !adjustmentValue) return;
    if (adjustmentType !== "FIXED_PRICE" && adjustmentType !== "PERCENT_DISCOUNT" && adjustmentType !== "FLAT_DISCOUNT") return;

    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, product: { organizationId } } });
    if (!variant) return; // the caller's own lookup already 404s this — nothing further to check.

    const settings = await this.getSettings(organizationId);
    if (settings.minimumMarginPercent.lte(0)) return;

    const cost = await resolveVariantCost(this.costing, organizationId, variant);
    if (cost === null) return; // can't protect what we can't measure.

    const value = new Decimal(adjustmentValue);
    let candidatePrice: Prisma.Decimal;
    if (adjustmentType === "FIXED_PRICE") candidatePrice = value;
    else if (adjustmentType === "PERCENT_DISCOUNT") candidatePrice = variant.basePrice.mul(new Decimal(1).sub(value.div(100)));
    else candidatePrice = variant.basePrice.sub(value);
    if (candidatePrice.lt(0)) candidatePrice = new Decimal(0);

    const floor = computeMinimumProfitablePrice(cost, settings.minimumMarginPercent);
    if (floor !== null && candidatePrice.lt(floor) && !approvedOverride) {
      throw new ConflictException(
        `This rule would price "${variant.name}" at ${candidatePrice.toDecimalPlaces(2)}, below the minimum profitable price of ${floor.toDecimalPlaces(2)} (cost ${cost.toDecimalPlaces(2)}, minimum margin ${settings.minimumMarginPercent}%). Set approvedOverride to confirm this is intentional.`,
      );
    }
  }
}
