import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { SuppliersService } from "./suppliers.service.js";

describe("SuppliersService", () => {
  let service: SuppliersService;
  let prisma: {
    supplier: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supplier: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SuppliersService);
  });

  it("scopes list() to the caller's organization", async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    await service.list("org_1");
    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { name: "asc" },
    });
  });

  it("findOne() 404s instead of leaking a supplier from another organization", async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "sup_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("maps a duplicate-name database error to a 409 Conflict", async () => {
    prisma.supplier.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.create("org_1", { name: "Acme Supplies" })).rejects.toThrow(ConflictException);
  });
});
