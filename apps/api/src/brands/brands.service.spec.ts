import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { BrandsService } from "./brands.service.js";

describe("BrandsService", () => {
  let service: BrandsService;
  let prisma: {
    brand: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      brand: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [BrandsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BrandsService);
  });

  it("scopes list() to the caller's organization", async () => {
    prisma.brand.findMany.mockResolvedValue([]);
    await service.list("org_1");
    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { name: "asc" },
    });
  });

  it("findOne() 404s instead of leaking a brand from another organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "brand_from_org_2")).rejects.toThrow(NotFoundException);
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: "brand_from_org_2", organizationId: "org_1" },
    });
  });

  it("update() refuses to touch a brand outside the caller's organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.update("org_1", "brand_from_org_2", { name: "Hijacked" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.brand.update).not.toHaveBeenCalled();
  });

  it("maps a duplicate-slug database error to a 409 Conflict", async () => {
    prisma.brand.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(service.create("org_1", { name: "Cafe Old Monk", slug: "cafe-old-monk" })).rejects.toThrow(
      ConflictException,
    );
  });
});
