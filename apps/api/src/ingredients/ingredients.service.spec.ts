import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { IngredientsService } from "./ingredients.service.js";

describe("IngredientsService", () => {
  let service: IngredientsService;
  let prisma: {
    ingredient: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      ingredient: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [IngredientsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(IngredientsService);
  });

  it("scopes list() to the caller's organization", async () => {
    prisma.ingredient.findMany.mockResolvedValue([]);
    await service.list("org_1");
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { name: "asc" },
    });
  });

  it("filters list() by kind when given", async () => {
    prisma.ingredient.findMany.mockResolvedValue([]);
    await service.list("org_1", "PACKAGING");
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1", kind: "PACKAGING" },
      orderBy: { name: "asc" },
    });
  });

  it("findOne() 404s instead of leaking an ingredient from another organization", async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "ing_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("maps a duplicate-SKU database error to a 409 Conflict", async () => {
    prisma.ingredient.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(service.create("org_1", { name: "Flour", sku: "ING-FLOUR", unit: "KILOGRAM" })).rejects.toThrow(
      ConflictException,
    );
  });
});
