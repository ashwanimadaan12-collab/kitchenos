import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { RidersService } from "./riders.service.js";

describe("RidersService", () => {
  let service: RidersService;
  let prisma: {
    deliveryRider: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    outlet: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      deliveryRider: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      outlet: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [RidersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RidersService);
  });

  it("hides deactivated riders by default and shows them on request", async () => {
    await service.list("org_1", "outlet_1");
    expect(prisma.deliveryRider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org_1", outletId: "outlet_1", isActive: true } }),
    );

    await service.list("org_1", "outlet_1", true);
    expect(prisma.deliveryRider.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: "org_1", outletId: "outlet_1" } }),
    );
  });

  it("404s instead of creating a rider against another organization's outlet", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", { outletId: "outlet_from_org_2", name: "Ramesh" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.deliveryRider.create).not.toHaveBeenCalled();
  });

  it("trims the name and stores a missing phone as null, never as an empty string", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1" });

    await service.create("org_1", { outletId: "outlet_1", name: "  Ramesh  " });

    expect(prisma.deliveryRider.create).toHaveBeenCalledWith({
      data: { organizationId: "org_1", outletId: "outlet_1", name: "Ramesh", phone: null, isActive: true },
    });
  });

  describe("update()", () => {
    beforeEach(() => {
      prisma.deliveryRider.findFirst.mockResolvedValue({ id: "rider_1" });
    });

    it("leaves the phone untouched when the field is absent", async () => {
      await service.update("org_1", "rider_1", { name: "Suresh" });
      expect(prisma.deliveryRider.update).toHaveBeenCalledWith({
        where: { id: "rider_1" },
        data: { name: "Suresh" },
      });
    });

    it("clears the phone when the field is explicitly null", async () => {
      // This is the distinction that matters: an absent key means "don't touch", an
      // explicit null means "erase". Collapsing the two is how a number becomes unremovable.
      await service.update("org_1", "rider_1", { phone: null });
      expect(prisma.deliveryRider.update).toHaveBeenCalledWith({
        where: { id: "rider_1" },
        data: { phone: null },
      });
    });

    it("writes an empty patch as an empty patch rather than wiping the record", async () => {
      await service.update("org_1", "rider_1", {});
      expect(prisma.deliveryRider.update).toHaveBeenCalledWith({ where: { id: "rider_1" }, data: {} });
    });

    it("404s for a rider from another organization", async () => {
      prisma.deliveryRider.findFirst.mockResolvedValue(null);
      await expect(service.update("org_1", "rider_from_org_2", { name: "X" })).rejects.toThrow(NotFoundException);
      expect(prisma.deliveryRider.update).not.toHaveBeenCalled();
    });
  });

  it("deactivates rather than deletes, so past deliveries keep naming who took them", async () => {
    prisma.deliveryRider.findFirst.mockResolvedValue({ id: "rider_1" });
    await service.deactivate("org_1", "rider_1");
    expect(prisma.deliveryRider.update).toHaveBeenCalledWith({ where: { id: "rider_1" }, data: { isActive: false } });
  });
});
