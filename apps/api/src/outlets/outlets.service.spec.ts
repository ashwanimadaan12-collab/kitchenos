import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { PlanService } from "../plan/plan.service.js";
import { OutletsService } from "./outlets.service.js";

describe("OutletsService", () => {
  let service: OutletsService;
  let prisma: {
    outlet: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    kitchen: { findFirst: jest.Mock };
    outletKitchen: { upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let plans: { assertWithinLimit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      outlet: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      kitchen: { findFirst: jest.fn() },
      outletKitchen: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    // PlanModule is @Global() in the app, so the service gets this for free there; a
    // TestingModule has no global scope, which is why it has to be provided by hand.
    plans = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        OutletsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanService, useValue: plans },
      ],
    }).compile();

    service = module.get(OutletsService);
  });

  it("refuses to create an outlet for a brand belonging to another organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null); // brand lookup scoped to org_1 finds nothing

    await expect(
      service.create("org_1", { brandId: "brand_from_org_2", name: "Rogue Outlet", code: "RG-01" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: "brand_from_org_2", organizationId: "org_1" },
    });
    expect(prisma.outlet.create).not.toHaveBeenCalled();
  });

  it("findOne() 404s instead of leaking an outlet from another organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "outlet_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("refuses to map a kitchen that belongs to a different organization than the outlet", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1" });
    prisma.kitchen.findFirst.mockResolvedValue(null);

    await expect(service.mapKitchen("org_1", "outlet_1", { kitchenId: "kitchen_from_org_2" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.outletKitchen.upsert).not.toHaveBeenCalled();
  });

  it("maps a kitchen to an outlet when both belong to the caller's organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1" });
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1", organizationId: "org_1" });
    prisma.outletKitchen.upsert.mockResolvedValue({ id: "ok_1" });

    const result = await service.mapKitchen("org_1", "outlet_1", { kitchenId: "kitchen_1" });

    expect(result).toEqual({ id: "ok_1" });
    expect(prisma.outletKitchen.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { outletId_kitchenId: { outletId: "outlet_1", kitchenId: "kitchen_1" } },
      }),
    );
  });
});
