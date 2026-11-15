import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { SegmentsService } from "./segments.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("SegmentsService", () => {
  let service: SegmentsService;
  let prisma: {
    customerSegment: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    loyaltyTier: { findFirst: jest.Mock; findMany: jest.Mock };
    customer: { findMany: jest.Mock };
    order: { findMany: jest.Mock; groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      customerSegment: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      loyaltyTier: { findFirst: jest.fn(), findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      order: { findMany: jest.fn(), groupBy: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [SegmentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SegmentsService);
  });

  describe("create", () => {
    it("404s for BRAND_PREFERENCE when the brand belongs to another organization", async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.create("org_1", { name: "Prefers Paproni", type: "BRAND_PREFERENCE", brandId: "brand_from_org_2" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("404s for LOYALTY_TIER when the tier belongs to another organization", async () => {
      prisma.loyaltyTier.findFirst.mockResolvedValue(null);
      await expect(
        service.create("org_1", { name: "Gold members", type: "LOYALTY_TIER", loyaltyTierId: "tier_from_org_2" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("maps a duplicate name to a 409 Conflict", async () => {
      prisma.customerSegment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      await expect(service.create("org_1", { name: "Everyone", type: "ALL" })).rejects.toThrow(ConflictException);
    });
  });

  describe("resolveCustomerIds", () => {
    it("ALL returns every customer in the organization", async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: "cust_1" }, { id: "cust_2" }]);
      const ids = await service.resolveCustomerIds("org_1", { type: "ALL" } as never);
      expect(ids).toEqual(["cust_1", "cust_2"]);
    });

    it("INACTIVE excludes customers with a recent PAID order", async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: "cust_inactive" }]);
      const ids = await service.resolveCustomerIds("org_1", { type: "INACTIVE", inactiveDays: 60 } as never);
      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orders: { none: { status: "PAID", closedAt: { gte: expect.any(Date) } } },
          }),
        }),
      );
      expect(ids).toEqual(["cust_inactive"]);
    });

    it("REPEAT groups PAID orders by customer and filters by minOrders via having", async () => {
      prisma.order.groupBy.mockResolvedValue([{ customerId: "cust_1" }, { customerId: "cust_2" }]);
      const ids = await service.resolveCustomerIds("org_1", { type: "REPEAT", minOrders: 3 } as never);
      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ having: { customerId: { _count: { gte: 3 } } } }),
      );
      expect(ids).toEqual(["cust_1", "cust_2"]);
    });

    it("BRAND_PREFERENCE picks customers whose most-ordered brand matches", async () => {
      prisma.order.findMany.mockResolvedValue([
        { customerId: "cust_1", outlet: { brandId: "brand_a" } },
        { customerId: "cust_1", outlet: { brandId: "brand_a" } },
        { customerId: "cust_1", outlet: { brandId: "brand_b" } },
        { customerId: "cust_2", outlet: { brandId: "brand_b" } },
      ]);
      const ids = await service.resolveCustomerIds("org_1", { type: "BRAND_PREFERENCE", brandId: "brand_a" } as never);
      expect(ids).toEqual(["cust_1"]);
    });

    it("TOTAL_SPEND filters customers whose summed PAID total meets the minimum", async () => {
      prisma.order.groupBy.mockResolvedValue([
        { customerId: "cust_big", _sum: { total: D("5000") } },
        { customerId: "cust_small", _sum: { total: D("50") } },
      ]);
      const ids = await service.resolveCustomerIds("org_1", { type: "TOTAL_SPEND", minSpend: D("1000") } as never);
      expect(ids).toEqual(["cust_big"]);
    });

    it("LOYALTY_TIER matches customers whose derived current tier equals the target", async () => {
      prisma.loyaltyTier.findMany.mockResolvedValue([
        { id: "t_silver", minLifetimePoints: 0 },
        { id: "t_gold", minLifetimePoints: 500 },
      ]);
      prisma.customer.findMany.mockResolvedValue([
        { id: "cust_gold", lifetimePoints: 600 },
        { id: "cust_silver", lifetimePoints: 100 },
      ]);
      const ids = await service.resolveCustomerIds("org_1", { type: "LOYALTY_TIER", loyaltyTierId: "t_gold" } as never);
      expect(ids).toEqual(["cust_gold"]);
    });

    it("BIRTHDAY_THIS_WEEK matches a birthday falling within the next 7 days", async () => {
      const today = new Date();
      const inThreeDays = new Date(today);
      inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3);
      const faraway = new Date(today);
      faraway.setUTCDate(faraway.getUTCDate() + 100);

      prisma.customer.findMany.mockResolvedValue([
        { id: "cust_soon", birthday: new Date(Date.UTC(1990, inThreeDays.getUTCMonth(), inThreeDays.getUTCDate())) },
        { id: "cust_far", birthday: new Date(Date.UTC(1990, faraway.getUTCMonth(), faraway.getUTCDate())) },
      ]);
      const ids = await service.resolveCustomerIds("org_1", { type: "BIRTHDAY_THIS_WEEK" } as never);
      expect(ids).toEqual(["cust_soon"]);
    });
  });
});
