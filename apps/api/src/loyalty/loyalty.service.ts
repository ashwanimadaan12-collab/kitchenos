import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaService, type LoyaltyTier, type LoyaltyTransactionType } from "@kitchenos/database";
import type {
  CreateLoyaltyTierDto,
  ManualLoyaltyAdjustmentDto,
  UpdateLoyaltyProgramSettingsDto,
  UpdateLoyaltyTierDto,
  UpsertBrandLoyaltyRuleDto,
} from "@kitchenos/shared";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";

const { Decimal } = Prisma;

interface TransactionFilters {
  type?: LoyaltyTransactionType;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class LoyaltyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyService.name);
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stand-in for a scheduled job (the same "real interval timer, skipped under Jest" pattern
   * as CommunicationsService's dispatch loop) — runs the expiry and birthday-bonus sweeps.
   * Both are cheap no-ops when nothing is due, so a short interval is safe in dev; a production
   * deployment would run these on a daily cron instead.
   */
  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID) return;
    this.sweepTimer = setInterval(() => {
      this.runExpirySweep().catch((err) => this.logger.error("Loyalty expiry sweep failed", err));
      this.runBirthdaySweep().catch((err) => this.logger.error("Loyalty birthday sweep failed", err));
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // --------------------------------------------------------------- Settings

  async getSettings(organizationId: string) {
    const existing = await this.prisma.loyaltyProgramSettings.findUnique({ where: { organizationId } });
    if (existing) return existing;
    try {
      return await this.prisma.loyaltyProgramSettings.create({ data: { organizationId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return this.prisma.loyaltyProgramSettings.findUniqueOrThrow({ where: { organizationId } });
      }
      throw err;
    }
  }

  async updateSettings(organizationId: string, dto: UpdateLoyaltyProgramSettingsDto) {
    await this.getSettings(organizationId);
    return this.prisma.loyaltyProgramSettings.update({ where: { organizationId }, data: dto });
  }

  // ------------------------------------------------------------------ Tiers

  async listTiers(organizationId: string) {
    return this.prisma.loyaltyTier.findMany({ where: { organizationId }, orderBy: { minLifetimePoints: "asc" } });
  }

  async createTier(organizationId: string, dto: CreateLoyaltyTierDto) {
    try {
      return await this.prisma.loyaltyTier.create({ data: { organizationId, ...dto } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("A tier with this name already exists");
      }
      throw err;
    }
  }

  async updateTier(organizationId: string, id: string, dto: UpdateLoyaltyTierDto) {
    await assertBelongsToOrg(() => this.prisma.loyaltyTier.findFirst({ where: { id, organizationId } }), "Loyalty tier");
    return this.prisma.loyaltyTier.update({ where: { id }, data: dto });
  }

  /** The highest tier whose threshold the customer's lifetime (never-reduced) points have crossed. */
  private deriveTier(tiers: LoyaltyTier[], lifetimePoints: number): LoyaltyTier | null {
    const eligible = tiers
      .filter((t) => t.minLifetimePoints <= lifetimePoints)
      .sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
    return eligible[0] ?? null;
  }

  // ------------------------------------------------------------ Brand rules

  async getBrandRule(organizationId: string, brandId: string) {
    return this.prisma.brandLoyaltyRule.findFirst({ where: { organizationId, brandId } });
  }

  async upsertBrandRule(organizationId: string, brandId: string, dto: UpsertBrandLoyaltyRuleDto) {
    await assertBelongsToOrg(() => this.prisma.brand.findFirst({ where: { id: brandId, organizationId } }), "Brand");
    return this.prisma.brandLoyaltyRule.upsert({
      where: { brandId },
      create: { organizationId, brandId, ...dto },
      update: dto,
    });
  }

  /** Brand-specific rates override the organization default when set; null fields fall back. */
  private async resolveRates(
    organizationId: string,
    brandId?: string | null,
  ): Promise<{ earningRate: Prisma.Decimal; redemptionRatio: Prisma.Decimal }> {
    const settings = await this.getSettings(organizationId);
    if (!brandId) return { earningRate: settings.earningRate, redemptionRatio: settings.redemptionRatio };
    const rule = await this.prisma.brandLoyaltyRule.findUnique({ where: { brandId } });
    return {
      earningRate: rule?.earningRate ?? settings.earningRate,
      redemptionRatio: rule?.redemptionRatio ?? settings.redemptionRatio,
    };
  }

  // ------------------------------------------------------------------ Wallet

  async getWallet(organizationId: string, customerId: string) {
    const customer = await assertBelongsToOrg(
      () => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }),
      "Customer",
    );
    const tiers = await this.listTiers(organizationId);
    const tier = this.deriveTier(tiers, customer.lifetimePoints);
    const nextTier = [...tiers]
      .sort((a, b) => a.minLifetimePoints - b.minLifetimePoints)
      .find((t) => t.minLifetimePoints > customer.lifetimePoints);

    return {
      balance: customer.loyaltyPoints,
      lifetimePoints: customer.lifetimePoints,
      tier: tier ? { id: tier.id, name: tier.name, earningMultiplier: tier.earningMultiplier } : null,
      nextTier: nextTier
        ? { id: nextTier.id, name: nextTier.name, pointsNeeded: nextTier.minLifetimePoints - customer.lifetimePoints }
        : null,
    };
  }

  async listTransactions(organizationId: string, customerId: string, filters: TransactionFilters) {
    await assertBelongsToOrg(() => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }), "Customer");
    return this.prisma.loyaltyTransaction.findMany({
      where: {
        organizationId,
        customerId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
    });
  }

  // ------------------------------------------------------- Earning & bonuses

  /**
   * Best-effort — never throws into the caller's order flow, the same principle as
   * AuditService.log() and InventoryService's consumption hooks. Tier multiplier is read from
   * the customer's lifetime points *before* this order's points are added, since a tier is
   * earned by what came before, not inflated by the very order that might cross its threshold.
   */
  async earnPoints(
    organizationId: string,
    customerId: string,
    orderTotal: Prisma.Decimal,
    orderId: string,
    brandId?: string | null,
  ): Promise<void> {
    try {
      const [{ earningRate }, settings, customer, tiers] = await Promise.all([
        this.resolveRates(organizationId, brandId),
        this.getSettings(organizationId),
        this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
        this.listTiers(organizationId),
      ]);
      const multiplier = this.deriveTier(tiers, customer.lifetimePoints)?.earningMultiplier ?? new Decimal(1);
      const points = orderTotal.div(100).mul(earningRate).mul(multiplier).floor().toNumber();
      if (points <= 0) return;

      const expiresAt = settings.pointsExpiryDays
        ? new Date(Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000)
        : null;

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: points }, lifetimePoints: { increment: points } },
        });
        await tx.loyaltyTransaction.create({
          data: { organizationId, customerId, type: "EARN", points, balanceAfter: updated.loyaltyPoints, orderId, expiresAt },
        });
      });
    } catch (err) {
      this.logger.error(`Failed to earn loyalty points for customer "${customerId}"`, err);
    }
  }

  /** Best-effort — called right after a customer is created; a configured amount of 0 is a no-op. */
  async grantWelcomeBonus(organizationId: string, customerId: string): Promise<void> {
    try {
      const settings = await this.getSettings(organizationId);
      if (settings.welcomeBonusPoints <= 0) return;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: settings.welcomeBonusPoints }, lifetimePoints: { increment: settings.welcomeBonusPoints } },
        });
        await tx.loyaltyTransaction.create({
          data: { organizationId, customerId, type: "WELCOME_BONUS", points: settings.welcomeBonusPoints, balanceAfter: updated.loyaltyPoints, note: "Welcome bonus" },
        });
      });
    } catch (err) {
      this.logger.error(`Failed to grant welcome bonus to customer "${customerId}"`, err);
    }
  }

  /**
   * Best-effort. `Customer.referralBonusGrantedAt` starting null and being claimed atomically
   * here (conditional updateMany, count === 0 means already claimed or lost a race) is the
   * entire "exactly once" guard — it doesn't matter which of the referee's orders triggers it,
   * only that it never fires twice for the same referee.
   */
  async grantReferralBonusIfEligible(organizationId: string, refereeCustomerId: string, orderId: string): Promise<void> {
    try {
      const referee = await this.prisma.customer.findUnique({ where: { id: refereeCustomerId } });
      if (!referee?.referredByCustomerId) return;
      const settings = await this.getSettings(organizationId);
      if (settings.referralBonusPoints <= 0) return;

      const claimed = await this.prisma.customer.updateMany({
        where: { id: refereeCustomerId, referralBonusGrantedAt: null },
        data: { referralBonusGrantedAt: new Date() },
      });
      if (claimed.count === 0) return;

      const referrerId = referee.referredByCustomerId;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: referrerId },
          data: { loyaltyPoints: { increment: settings.referralBonusPoints }, lifetimePoints: { increment: settings.referralBonusPoints } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            organizationId,
            customerId: referrerId,
            type: "REFERRAL_BONUS",
            points: settings.referralBonusPoints,
            balanceAfter: updated.loyaltyPoints,
            orderId,
            note: `Referral bonus for referring ${referee.name}`,
          },
        });
      });
    } catch (err) {
      this.logger.error(`Failed to grant referral bonus for referee "${refereeCustomerId}"`, err);
    }
  }

  /**
   * Org-wide outstanding liability if every customer redeemed their full balance today, valued
   * at the organization's default redemption ratio. Brand-specific `BrandLoyaltyRule` overrides
   * aren't applied here — a customer's balance isn't tagged to the brand it was earned under, so
   * there's no way to split it by rate; this is an approximation, documented as such wherever it
   * is surfaced (same category of scope boundary as the dashboard's other aggregate reports).
   */
  async getPointsLiability(organizationId: string): Promise<{ totalPoints: number; redemptionRatio: Prisma.Decimal; estimatedLiability: Prisma.Decimal }> {
    const [{ redemptionRatio }, agg] = await Promise.all([
      this.resolveRates(organizationId),
      this.prisma.customer.aggregate({ where: { organizationId }, _sum: { loyaltyPoints: true } }),
    ]);
    const totalPoints = agg._sum.loyaltyPoints ?? 0;
    return { totalPoints, redemptionRatio, estimatedLiability: redemptionRatio.mul(totalPoints) };
  }

  // --------------------------------------------------------------- Redemption

  async previewRedemption(organizationId: string, points: number, brandId?: string | null): Promise<Prisma.Decimal> {
    const { redemptionRatio } = await this.resolveRates(organizationId, brandId);
    return redemptionRatio.mul(points);
  }

  /**
   * Debits the customer's balance immediately (a REDEEM ledger row), not at payment time — the
   * same "reservation" shape as PromotionRedemption — so two concurrently open orders can never
   * both spend the same points. Throws ConflictException on an insufficient balance; this is a
   * direct cashier action, not a best-effort side effect.
   */
  async redeemPoints(organizationId: string, orderId: string, customerId: string, points: number, brandId?: string | null) {
    const { redemptionRatio } = await this.resolveRates(organizationId, brandId);
    const discountAmount = redemptionRatio.mul(points);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customer.updateMany({
        where: { id: customerId, organizationId, loyaltyPoints: { gte: points } },
        data: { loyaltyPoints: { decrement: points } },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Insufficient loyalty points balance");
      }
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      await tx.loyaltyTransaction.create({
        data: { organizationId, customerId, type: "REDEEM", points: -points, balanceAfter: customer.loyaltyPoints, orderId },
      });
      return tx.loyaltyRedemption.create({ data: { organizationId, orderId, customerId, pointsRedeemed: points, discountAmount } });
    });
  }

  /**
   * Best-effort, called from OrdersService.voidOrder — a void must never be blocked by loyalty
   * bookkeeping. A no-op if the order never had a redemption applied.
   */
  async reverseRedemption(organizationId: string, orderId: string): Promise<void> {
    try {
      const redemption = await this.prisma.loyaltyRedemption.findUnique({ where: { orderId } });
      if (!redemption) return;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: redemption.customerId },
          data: { loyaltyPoints: { increment: redemption.pointsRedeemed } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            organizationId,
            customerId: redemption.customerId,
            type: "REDEMPTION_REVERSAL",
            points: redemption.pointsRedeemed,
            balanceAfter: updated.loyaltyPoints,
            orderId,
            note: "Order voided before payment",
          },
        });
        await tx.loyaltyRedemption.delete({ where: { orderId } });
      });
    } catch (err) {
      this.logger.error(`Failed to reverse loyalty redemption for order "${orderId}"`, err);
    }
  }

  // --------------------------------------------------------- Manual adjustment

  async recordManualAdjustment(organizationId: string, customerId: string, dto: ManualLoyaltyAdjustmentDto, userId: string) {
    await assertBelongsToOrg(() => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }), "Customer");

    return this.prisma.$transaction(async (tx) => {
      if (dto.points < 0) {
        const claimed = await tx.customer.updateMany({
          where: { id: customerId, loyaltyPoints: { gte: -dto.points } },
          data: { loyaltyPoints: { increment: dto.points } },
        });
        if (claimed.count === 0) {
          throw new ConflictException("Insufficient loyalty points balance for this adjustment");
        }
      } else {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: dto.points }, lifetimePoints: { increment: dto.points } },
        });
      }
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
      return tx.loyaltyTransaction.create({
        data: {
          organizationId,
          customerId,
          type: "MANUAL_ADJUSTMENT",
          points: dto.points,
          balanceAfter: customer.loyaltyPoints,
          note: dto.note,
          createdByUserId: userId,
        },
      });
    });
  }

  // -------------------------------------------------------------- Sweeps

  /**
   * Birthday matching is done in application code rather than a DB query filtering on
   * month/day of a DateTime column (not portable, and not worth a raw-SQL expression at this
   * data volume — the same "computed on demand" tradeoff as the Prompt 10 reports).
   * `lastBirthdayBonusAt`'s year is the one-time-per-year guard, claimed atomically per
   * customer so a sweep that overlaps itself can't double-grant.
   */
  async runBirthdaySweep(organizationId?: string): Promise<number> {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const customers = await this.prisma.customer.findMany({
      where: { birthday: { not: null }, ...(organizationId ? { organizationId } : {}) },
    });

    let granted = 0;
    for (const customer of customers) {
      if (!customer.birthday) continue;
      if (customer.birthday.getUTCMonth() + 1 !== month || customer.birthday.getUTCDate() !== day) continue;
      if (customer.lastBirthdayBonusAt && customer.lastBirthdayBonusAt >= yearStart) continue;

      try {
        const settings = await this.getSettings(customer.organizationId);
        if (settings.birthdayBonusPoints <= 0) continue;

        const claimed = await this.prisma.customer.updateMany({
          where: { id: customer.id, OR: [{ lastBirthdayBonusAt: null }, { lastBirthdayBonusAt: { lt: yearStart } }] },
          data: { lastBirthdayBonusAt: now },
        });
        if (claimed.count === 0) continue;

        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.customer.update({
            where: { id: customer.id },
            data: { loyaltyPoints: { increment: settings.birthdayBonusPoints }, lifetimePoints: { increment: settings.birthdayBonusPoints } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              organizationId: customer.organizationId,
              customerId: customer.id,
              type: "BIRTHDAY_BONUS",
              points: settings.birthdayBonusPoints,
              balanceAfter: updated.loyaltyPoints,
              note: "Happy birthday!",
            },
          });
        });
        granted++;
      } catch (err) {
        this.logger.error(`Failed to grant birthday bonus to customer "${customer.id}"`, err);
      }
    }
    return granted;
  }

  /**
   * Finds unexpired EARN rows whose expiresAt has passed, nets them per customer, and expires
   * at most the customer's *current* balance — a redemption may already have consumed some or
   * all of those specific points, and this never pushes a balance negative. The source EARN
   * rows are marked `expiredAt` regardless, so they're never reconsidered by a later sweep.
   */
  async runExpirySweep(organizationId?: string): Promise<number> {
    const now = new Date();
    const dueRows = await this.prisma.loyaltyTransaction.findMany({
      where: { type: "EARN", expiresAt: { lte: now }, expiredAt: null, ...(organizationId ? { organizationId } : {}) },
    });

    const byCustomer = new Map<string, { organizationId: string; rowIds: string[]; duePoints: number }>();
    for (const row of dueRows) {
      const entry = byCustomer.get(row.customerId) ?? { organizationId: row.organizationId, rowIds: [], duePoints: 0 };
      entry.rowIds.push(row.id);
      entry.duePoints += row.points;
      byCustomer.set(row.customerId, entry);
    }

    let processed = 0;
    for (const [customerId, { organizationId: orgId, rowIds, duePoints }] of byCustomer) {
      try {
        const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
        const expirable = Math.min(duePoints, customer.loyaltyPoints);

        await this.prisma.$transaction(async (tx) => {
          await tx.loyaltyTransaction.updateMany({ where: { id: { in: rowIds } }, data: { expiredAt: now } });
          if (expirable > 0) {
            const updated = await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { decrement: expirable } } });
            await tx.loyaltyTransaction.create({
              data: {
                organizationId: orgId,
                customerId,
                type: "EXPIRE",
                points: -expirable,
                balanceAfter: updated.loyaltyPoints,
                note: `${duePoints} point(s) reached their expiry date`,
              },
            });
          }
        });
        processed++;
      } catch (err) {
        this.logger.error(`Failed to expire loyalty points for customer "${customerId}"`, err);
      }
    }
    return processed;
  }
}
