import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { LoyaltyService } from "./loyalty.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("LoyaltyService", () => {
  let service: LoyaltyService;
  let prisma: {
    loyaltyProgramSettings: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock; update: jest.Mock };
    loyaltyTier: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    brandLoyaltyRule: { findFirst: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
    brand: { findFirst: jest.Mock };
    customer: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
    };
    loyaltyTransaction: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
    loyaltyRedemption: { findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      loyaltyProgramSettings: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      loyaltyTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      brandLoyaltyRule: { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      brand: { findFirst: jest.fn() },
      customer: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn(),
      },
      loyaltyTransaction: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      loyaltyRedemption: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

    const module = await Test.createTestingModule({
      providers: [LoyaltyService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LoyaltyService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe("settings", () => {
    it("lazily creates a default settings row on first read", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue(null);
      prisma.loyaltyProgramSettings.create.mockResolvedValue({ organizationId: "org_1", earningRate: D("1") });
      const settings = await service.getSettings("org_1");
      expect(prisma.loyaltyProgramSettings.create).toHaveBeenCalledWith({ data: { organizationId: "org_1" } });
      expect(settings.earningRate.toString()).toBe("1");
    });

    it("re-fetches instead of throwing when a concurrent lazy-create already won the race", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue(null);
      prisma.loyaltyProgramSettings.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      prisma.loyaltyProgramSettings.findUniqueOrThrow.mockResolvedValue({ organizationId: "org_1" });
      const settings = await service.getSettings("org_1");
      expect(settings.organizationId).toBe("org_1");
    });

    it("updateSettings() ensures the row exists before updating", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1" });
      prisma.loyaltyProgramSettings.update.mockResolvedValue({ organizationId: "org_1", welcomeBonusPoints: 100 });
      await service.updateSettings("org_1", { welcomeBonusPoints: 100 });
      expect(prisma.loyaltyProgramSettings.update).toHaveBeenCalledWith({
        where: { organizationId: "org_1" },
        data: { welcomeBonusPoints: 100 },
      });
    });
  });

  describe("getPointsLiability", () => {
    it("values every customer's outstanding balance at the org's default redemption ratio", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", redemptionRatio: D("0.5") });
      prisma.customer.aggregate.mockResolvedValue({ _sum: { loyaltyPoints: 1000 } });

      const result = await service.getPointsLiability("org_1");

      expect(prisma.customer.aggregate).toHaveBeenCalledWith({ where: { organizationId: "org_1" }, _sum: { loyaltyPoints: true } });
      expect(result).toEqual({ totalPoints: 1000, redemptionRatio: D("0.5"), estimatedLiability: D("500") });
    });

    it("reports zero liability when no customer holds any points", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", redemptionRatio: D("0.5") });
      prisma.customer.aggregate.mockResolvedValue({ _sum: { loyaltyPoints: null } });

      const result = await service.getPointsLiability("org_1");

      expect(result.totalPoints).toBe(0);
      expect(result.estimatedLiability.toString()).toBe("0");
    });
  });

  describe("tiers", () => {
    it("createTier() maps a duplicate name to a 409 Conflict", async () => {
      prisma.loyaltyTier.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      await expect(
        service.createTier("org_1", { name: "Gold", minLifetimePoints: 1000, earningMultiplier: "1.5", sortOrder: 1 }),
      ).rejects.toThrow(ConflictException);
    });

    it("updateTier() 404s for a tier from another organization", async () => {
      prisma.loyaltyTier.findFirst.mockResolvedValue(null);
      await expect(service.updateTier("org_1", "tier_from_org_2", { sortOrder: 2 })).rejects.toThrow(NotFoundException);
    });
  });

  describe("brand rules", () => {
    it("upsertBrandRule() 404s when the brand belongs to another organization", async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(service.upsertBrandRule("org_1", "brand_from_org_2", { earningRate: "2" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("wallet", () => {
    it("404s for a customer from another organization", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(service.getWallet("org_1", "cust_from_org_2")).rejects.toThrow(NotFoundException);
    });

    it("derives the highest tier the customer's lifetime points have crossed, and the next tier's gap", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", loyaltyPoints: 500, lifetimePoints: 1200 });
      prisma.loyaltyTier.findMany.mockResolvedValue([
        { id: "t_silver", name: "Silver", minLifetimePoints: 0, earningMultiplier: D("1") },
        { id: "t_gold", name: "Gold", minLifetimePoints: 1000, earningMultiplier: D("1.5") },
        { id: "t_platinum", name: "Platinum", minLifetimePoints: 5000, earningMultiplier: D("2") },
      ]);

      const wallet = await service.getWallet("org_1", "cust_1");

      expect(wallet.balance).toBe(500);
      expect(wallet.tier?.name).toBe("Gold");
      expect(wallet.nextTier).toEqual({ id: "t_platinum", name: "Platinum", pointsNeeded: 3800 });
    });

    it("has no tier when lifetime points haven't crossed even the lowest threshold", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", loyaltyPoints: 0, lifetimePoints: 0 });
      prisma.loyaltyTier.findMany.mockResolvedValue([
        { id: "t_gold", name: "Gold", minLifetimePoints: 1000, earningMultiplier: D("1.5") },
      ]);
      const wallet = await service.getWallet("org_1", "cust_1");
      expect(wallet.tier).toBeNull();
      expect(wallet.nextTier?.pointsNeeded).toBe(1000);
    });
  });

  describe("earnPoints", () => {
    it("is a no-op (never throws) when it would earn zero points", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", earningRate: D("1"), pointsExpiryDays: null });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", lifetimePoints: 0 });
      await service.earnPoints("org_1", "cust_1", D("50"), "order_1");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("applies the tier multiplier on top of the configured earning rate", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", earningRate: D("1"), pointsExpiryDays: null });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", lifetimePoints: 2000 });
      prisma.loyaltyTier.findMany.mockResolvedValue([
        { id: "t_gold", name: "Gold", minLifetimePoints: 1000, earningMultiplier: D("2") },
      ]);
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 400 });

      await service.earnPoints("org_1", "cust_1", D("200"), "order_1");

      // 200/100 * earningRate(1) * multiplier(2) = 4 points.
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust_1" },
        data: { loyaltyPoints: { increment: 4 }, lifetimePoints: { increment: 4 } },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "EARN", points: 4, orderId: "order_1" }) }),
      );
    });

    it("stamps an expiresAt when the program has a configured expiry window", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", earningRate: D("1"), pointsExpiryDays: 30 });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", lifetimePoints: 0 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 4 });

      await service.earnPoints("org_1", "cust_1", D("400"), "order_1");

      const data = prisma.loyaltyTransaction.create.mock.calls[0][0].data;
      expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it("never throws even when the update fails", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", earningRate: D("1"), pointsExpiryDays: null });
      prisma.customer.findUniqueOrThrow.mockRejectedValue(new Error("db exploded"));
      await expect(service.earnPoints("org_1", "cust_1", D("500"), "order_1")).resolves.toBeUndefined();
    });
  });

  describe("grantWelcomeBonus", () => {
    it("does nothing when no welcome bonus is configured", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", welcomeBonusPoints: 0 });
      await service.grantWelcomeBonus("org_1", "cust_1");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("credits the configured bonus and counts it toward lifetime points", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", welcomeBonusPoints: 50 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 50 });
      await service.grantWelcomeBonus("org_1", "cust_1");
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust_1" },
        data: { loyaltyPoints: { increment: 50 }, lifetimePoints: { increment: 50 } },
      });
    });
  });

  describe("grantReferralBonusIfEligible", () => {
    it("does nothing when the referee was not referred by anyone", async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: "referee_1", referredByCustomerId: null });
      await service.grantReferralBonusIfEligible("org_1", "referee_1", "order_1");
      expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    });

    it("does nothing once already granted (or a concurrent request already claimed it)", async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: "referee_1", referredByCustomerId: "referrer_1", name: "Referee" });
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", referralBonusPoints: 100 });
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await service.grantReferralBonusIfEligible("org_1", "referee_1", "order_1");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("credits the referrer exactly once, claimed atomically via referralBonusGrantedAt", async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: "referee_1", referredByCustomerId: "referrer_1", name: "Referee" });
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", referralBonusPoints: 100 });
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 100 });

      await service.grantReferralBonusIfEligible("org_1", "referee_1", "order_1");

      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: "referee_1", referralBonusGrantedAt: null },
        data: { referralBonusGrantedAt: expect.any(Date) },
      });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "referrer_1" },
        data: { loyaltyPoints: { increment: 100 }, lifetimePoints: { increment: 100 } },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "REFERRAL_BONUS", customerId: "referrer_1" }) }),
      );
    });
  });

  describe("redemption", () => {
    it("previewRedemption() multiplies points by the redemption ratio", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", redemptionRatio: D("0.5") });
      const amount = await service.previewRedemption("org_1", 100);
      expect(amount.toString()).toBe("50");
    });

    it("redeemPoints() throws a Conflict when the balance is insufficient", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", redemptionRatio: D("1") });
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.redeemPoints("org_1", "order_1", "cust_1", 100)).rejects.toThrow(ConflictException);
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
    });

    it("redeemPoints() debits the balance and records a REDEEM transaction plus a LoyaltyRedemption row", async () => {
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", redemptionRatio: D("1") });
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", loyaltyPoints: 400 });
      prisma.loyaltyRedemption.create.mockResolvedValue({ id: "redemption_1", pointsRedeemed: 100, discountAmount: D("100") });

      const result = await service.redeemPoints("org_1", "order_1", "cust_1", 100);

      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: "cust_1", organizationId: "org_1", loyaltyPoints: { gte: 100 } },
        data: { loyaltyPoints: { decrement: 100 } },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "REDEEM", points: -100, balanceAfter: 400 }) }),
      );
      expect(result.pointsRedeemed).toBe(100);
    });

    it("reverseRedemption() is a no-op when the order never had a redemption", async () => {
      prisma.loyaltyRedemption.findUnique.mockResolvedValue(null);
      await service.reverseRedemption("org_1", "order_1");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("reverseRedemption() credits the points back and deletes the redemption row", async () => {
      prisma.loyaltyRedemption.findUnique.mockResolvedValue({ orderId: "order_1", customerId: "cust_1", pointsRedeemed: 100 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 500 });

      await service.reverseRedemption("org_1", "order_1");

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust_1" },
        data: { loyaltyPoints: { increment: 100 } },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "REDEMPTION_REVERSAL", points: 100 }) }),
      );
      expect(prisma.loyaltyRedemption.delete).toHaveBeenCalledWith({ where: { orderId: "order_1" } });
    });

    it("reverseRedemption() never throws, even if the credit-back fails", async () => {
      prisma.loyaltyRedemption.findUnique.mockRejectedValue(new Error("db exploded"));
      await expect(service.reverseRedemption("org_1", "order_1")).resolves.toBeUndefined();
    });
  });

  describe("recordManualAdjustment", () => {
    it("404s for a customer from another organization", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.recordManualAdjustment("org_1", "cust_from_org_2", { points: 10, note: "test" }, "user_1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects a negative adjustment that would push the balance below zero", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customer.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.recordManualAdjustment("org_1", "cust_1", { points: -500, note: "correction" }, "user_1"),
      ).rejects.toThrow(ConflictException);
    });

    it("a positive adjustment increments both balance and lifetime points", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", loyaltyPoints: 150 });
      await service.recordManualAdjustment("org_1", "cust_1", { points: 50, note: "goodwill" }, "user_1");
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust_1" },
        data: { loyaltyPoints: { increment: 50 }, lifetimePoints: { increment: 50 } },
      });
    });

    it("a negative adjustment does not touch lifetime points", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", loyaltyPoints: 50 });
      await service.recordManualAdjustment("org_1", "cust_1", { points: -50, note: "correction" }, "user_1");
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "MANUAL_ADJUSTMENT", points: -50 }) }),
      );
    });
  });

  describe("runBirthdaySweep", () => {
    it("grants the bonus to a customer whose birthday is today and hasn't been granted this year", async () => {
      const today = new Date();
      const birthday = new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate()));
      prisma.customer.findMany.mockResolvedValue([
        { id: "cust_1", organizationId: "org_1", birthday, lastBirthdayBonusAt: null },
      ]);
      prisma.loyaltyProgramSettings.findUnique.mockResolvedValue({ organizationId: "org_1", birthdayBonusPoints: 20 });
      prisma.customer.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 20 });

      const granted = await service.runBirthdaySweep();

      expect(granted).toBe(1);
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "BIRTHDAY_BONUS", points: 20 }) }),
      );
    });

    it("skips a customer whose birthday isn't today", async () => {
      const notToday = new Date();
      notToday.setUTCDate(notToday.getUTCDate() + 10);
      prisma.customer.findMany.mockResolvedValue([
        { id: "cust_1", organizationId: "org_1", birthday: notToday, lastBirthdayBonusAt: null },
      ]);
      const granted = await service.runBirthdaySweep();
      expect(granted).toBe(0);
      expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    });

    it("skips a customer already granted this year's bonus", async () => {
      const today = new Date();
      const birthday = new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate()));
      prisma.customer.findMany.mockResolvedValue([
        { id: "cust_1", organizationId: "org_1", birthday, lastBirthdayBonusAt: new Date() },
      ]);
      const granted = await service.runBirthdaySweep();
      expect(granted).toBe(0);
      expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("runExpirySweep", () => {
    it("expires due points capped at the customer's current balance and marks the source rows expired", async () => {
      prisma.loyaltyTransaction.findMany.mockResolvedValue([
        { id: "tx_1", customerId: "cust_1", organizationId: "org_1", points: 30 },
        { id: "tx_2", customerId: "cust_1", organizationId: "org_1", points: 20 },
      ]);
      // Customer only has 10 left — a redemption already spent most of what was earned.
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", loyaltyPoints: 10 });
      prisma.customer.update.mockResolvedValue({ loyaltyPoints: 0 });

      const processed = await service.runExpirySweep();

      expect(processed).toBe(1);
      expect(prisma.loyaltyTransaction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["tx_1", "tx_2"] } },
        data: { expiredAt: expect.any(Date) },
      });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "cust_1" },
        data: { loyaltyPoints: { decrement: 10 } },
      });
    });

    it("still marks rows expired even when nothing is left to actually expire", async () => {
      prisma.loyaltyTransaction.findMany.mockResolvedValue([
        { id: "tx_1", customerId: "cust_1", organizationId: "org_1", points: 30 },
      ]);
      prisma.customer.findUniqueOrThrow.mockResolvedValue({ id: "cust_1", loyaltyPoints: 0 });

      await service.runExpirySweep();

      expect(prisma.loyaltyTransaction.updateMany).toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });
});
