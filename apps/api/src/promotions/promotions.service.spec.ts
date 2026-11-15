import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { PromotionsService } from "./promotions.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("PromotionsService", () => {
  let service: PromotionsService;
  let prisma: {
    promotion: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    brand: { findFirst: jest.Mock };
    promotionRedemption: { count: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const openOrder = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: "order_1",
    organizationId: "org_1",
    subtotal: D("500"),
    taxTotal: D("25"),
    outlet: { brandId: "brand_1" },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      promotion: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      brand: { findFirst: jest.fn() },
      promotionRedemption: { count: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    // recordRedemption() runs its logic inside $transaction(callback) — simulate Prisma by
    // invoking the callback with `prisma` itself standing in for the transaction client `tx`.
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const module = await Test.createTestingModule({
      providers: [PromotionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PromotionsService);
  });

  it("findOne() 404s instead of leaking a promotion from another organization", async () => {
    prisma.promotion.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "promo_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("validateAndComputeDiscount() 404s for an unknown code", async () => {
    prisma.promotion.findFirst.mockResolvedValue(null);
    await expect(service.validateAndComputeDiscount("org_1", openOrder() as never, "NOPE")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("validateAndComputeDiscount() refuses an inactive promotion", async () => {
    prisma.promotion.findFirst.mockResolvedValue({ id: "promo_1", isActive: false });
    await expect(service.validateAndComputeDiscount("org_1", openOrder() as never, "DEAD10")).rejects.toThrow(
      ConflictException,
    );
  });

  it("validateAndComputeDiscount() refuses a promotion scoped to a different brand", async () => {
    prisma.promotion.findFirst.mockResolvedValue({ id: "promo_1", isActive: true, brandId: "brand_2" });
    await expect(service.validateAndComputeDiscount("org_1", openOrder() as never, "OTHERBRAND")).rejects.toThrow(
      ConflictException,
    );
  });

  it("validateAndComputeDiscount() enforces minOrderSubtotal", async () => {
    prisma.promotion.findFirst.mockResolvedValue({
      id: "promo_1",
      isActive: true,
      brandId: null,
      minOrderSubtotal: D("1000"),
      usageLimit: null,
    });
    await expect(
      service.validateAndComputeDiscount("org_1", openOrder({ subtotal: D("500") }) as never, "BIGORDER"),
    ).rejects.toThrow(BadRequestException);
  });

  it("validateAndComputeDiscount() enforces usageLimit by counting redemptions", async () => {
    prisma.promotion.findFirst.mockResolvedValue({
      id: "promo_1",
      isActive: true,
      brandId: null,
      minOrderSubtotal: null,
      usageLimit: 5,
    });
    prisma.promotionRedemption.count.mockResolvedValue(5);
    await expect(service.validateAndComputeDiscount("org_1", openOrder() as never, "LIMITED")).rejects.toThrow(
      ConflictException,
    );
  });

  it("computes a PERCENTAGE discount off the subtotal, capped by maxDiscountAmount", async () => {
    prisma.promotion.findFirst.mockResolvedValue({
      id: "promo_1",
      isActive: true,
      brandId: null,
      minOrderSubtotal: null,
      maxDiscountAmount: D("30"),
      usageLimit: null,
      type: "PERCENTAGE",
      value: D("10"),
    });
    const { discountAmount } = await service.validateAndComputeDiscount(
      "org_1",
      openOrder({ subtotal: D("500") }) as never,
      "TENOFF",
    );
    // 10% of 500 = 50, capped at maxDiscountAmount 30.
    expect(discountAmount.toString()).toBe("30");
  });

  it("computes a FLAT discount capped so it never exceeds the bill", async () => {
    prisma.promotion.findFirst.mockResolvedValue({
      id: "promo_1",
      isActive: true,
      brandId: null,
      minOrderSubtotal: null,
      maxDiscountAmount: null,
      usageLimit: null,
      type: "FLAT",
      value: D("1000"),
    });
    const { discountAmount } = await service.validateAndComputeDiscount(
      "org_1",
      openOrder({ subtotal: D("500"), taxTotal: D("25") }) as never,
      "HUGEFLAT",
    );
    // subtotal + taxTotal = 525, so a 1000 flat discount is capped at 525.
    expect(discountAmount.toString()).toBe("525");
  });

  it("recordRedemption() maps a duplicate order redemption to a 409 Conflict", async () => {
    prisma.promotion.findUniqueOrThrow.mockResolvedValue({ id: "promo_1", usageLimit: null });
    prisma.promotionRedemption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.recordRedemption("org_1", "order_1", "promo_1", D("10"))).rejects.toThrow(ConflictException);
  });

  it("recordRedemption() re-checks usageLimit inside its transaction and rejects once the limit is hit", async () => {
    prisma.promotion.findUniqueOrThrow.mockResolvedValue({ id: "promo_1", usageLimit: 5 });
    prisma.promotionRedemption.count.mockResolvedValue(5);
    await expect(service.recordRedemption("org_1", "order_1", "promo_1", D("10"))).rejects.toThrow(ConflictException);
    expect(prisma.promotionRedemption.create).not.toHaveBeenCalled();
  });

  it("recordRedemption() maps a Postgres serialization failure (lost the usage-limit race) to a 409 Conflict", async () => {
    prisma.promotion.findUniqueOrThrow.mockResolvedValue({ id: "promo_1", usageLimit: 5 });
    prisma.promotionRedemption.count.mockResolvedValue(4);
    prisma.promotionRedemption.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("could not serialize access", {
        code: "P2034",
        clientVersion: "test",
      }),
    );
    await expect(service.recordRedemption("org_1", "order_1", "promo_1", D("10"))).rejects.toThrow(ConflictException);
  });
});
