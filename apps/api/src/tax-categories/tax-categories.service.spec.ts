import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { TaxCategoriesService } from "./tax-categories.service.js";

describe("TaxCategoriesService", () => {
  let service: TaxCategoriesService;
  let prisma: {
    taxCategory: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      taxCategory: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [TaxCategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TaxCategoriesService);
  });

  it("scopes list() to the caller's organization", async () => {
    prisma.taxCategory.findMany.mockResolvedValue([]);
    await service.list("org_1");
    expect(prisma.taxCategory.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { name: "asc" },
    });
  });

  it("findOne() 404s instead of leaking a tax category from another organization", async () => {
    prisma.taxCategory.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "tc_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("maps a duplicate-name database error to a 409 Conflict", async () => {
    prisma.taxCategory.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.create("org_1", { name: "GST 5%", ratePercent: "5.00" })).rejects.toThrow(
      ConflictException,
    );
  });
});
