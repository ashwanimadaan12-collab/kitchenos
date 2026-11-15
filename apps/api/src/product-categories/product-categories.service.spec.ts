import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { ProductCategoriesService } from "./product-categories.service.js";

describe("ProductCategoriesService", () => {
  let service: ProductCategoriesService;
  let prisma: {
    productCategory: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      productCategory: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ProductCategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ProductCategoriesService);
  });

  it("refuses to create a category for a brand belonging to another organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(
      service.create("org_1", { brandId: "brand_from_org_2", name: "Rogue Category" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.productCategory.create).not.toHaveBeenCalled();
  });

  it("findOne() 404s instead of leaking a category from another organization", async () => {
    prisma.productCategory.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "cat_from_org_2")).rejects.toThrow(NotFoundException);
  });
});
