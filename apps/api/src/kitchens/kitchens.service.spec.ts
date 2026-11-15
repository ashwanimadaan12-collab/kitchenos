import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { KitchensService } from "./kitchens.service.js";

describe("KitchensService", () => {
  let service: KitchensService;
  let prisma: {
    kitchen: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    brandKitchen: { upsert: jest.Mock; deleteMany: jest.Mock };
    kitchenStation: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      kitchen: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      brandKitchen: { upsert: jest.fn(), deleteMany: jest.fn() },
      kitchenStation: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [KitchensService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(KitchensService);
  });

  it("findOne() 404s instead of leaking a kitchen from another organization", async () => {
    prisma.kitchen.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "kitchen_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("refuses to map a brand that belongs to a different organization than the kitchen", async () => {
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1", organizationId: "org_1" });
    prisma.brand.findFirst.mockResolvedValue(null); // brand lookup scoped to org_1 finds nothing

    await expect(service.mapBrand("org_1", "kitchen_1", { brandId: "brand_from_org_2" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: "brand_from_org_2", organizationId: "org_1" },
    });
    expect(prisma.brandKitchen.upsert).not.toHaveBeenCalled();
  });

  it("maps a brand to a kitchen when both belong to the caller's organization", async () => {
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1", organizationId: "org_1" });
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1", organizationId: "org_1" });
    prisma.brandKitchen.upsert.mockResolvedValue({ id: "bk_1", brandId: "brand_1", kitchenId: "kitchen_1" });

    const result = await service.mapBrand("org_1", "kitchen_1", { brandId: "brand_1", isPrimary: true });

    expect(result).toEqual({ id: "bk_1", brandId: "brand_1", kitchenId: "kitchen_1" });
    expect(prisma.brandKitchen.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { brandId_kitchenId: { brandId: "brand_1", kitchenId: "kitchen_1" } },
      }),
    );
  });

  it("addStation() refuses to add a station to a kitchen outside the caller's organization", async () => {
    prisma.kitchen.findFirst.mockResolvedValue(null);
    await expect(
      service.addStation("org_1", "kitchen_from_org_2", { name: "Grill", code: "GRILL-01" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.kitchenStation.create).not.toHaveBeenCalled();
  });
});
