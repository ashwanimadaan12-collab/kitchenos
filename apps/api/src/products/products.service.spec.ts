import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { ProductsService } from "./products.service.js";

describe("ProductsService", () => {
  let service: ProductsService;
  let prisma: {
    product: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    productCategory: { findFirst: jest.Mock };
    taxCategory: { findFirst: jest.Mock };
    productVariant: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      productCategory: { findFirst: jest.fn() },
      taxCategory: { findFirst: jest.fn() },
      productVariant: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ProductsService);
  });

  const createDto = {
    brandId: "brand_1",
    categoryId: "cat_1",
    name: "Margherita",
    sku: "PP-MARG",
    variants: [{ name: "Regular", sku: "PP-MARG-REG", basePrice: "199.00" }],
  };

  it("refuses to create a product for a brand belonging to another organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", createDto)).rejects.toThrow(NotFoundException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("refuses to create a product using a category that does not belong to the same brand", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1", organizationId: "org_1" });
    prisma.productCategory.findFirst.mockResolvedValue(null); // category lookup scoped to brandId finds nothing

    await expect(service.create("org_1", createDto)).rejects.toThrow(NotFoundException);
    expect(prisma.productCategory.findFirst).toHaveBeenCalledWith({
      where: { id: "cat_1", organizationId: "org_1", brandId: "brand_1" },
    });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("creates a product with its variants in one call when brand and category match", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1", organizationId: "org_1" });
    prisma.productCategory.findFirst.mockResolvedValue({ id: "cat_1", brandId: "brand_1" });
    prisma.product.create.mockResolvedValue({ id: "prod_1", brandId: "brand_1" });

    const result = await service.create("org_1", createDto);

    expect(result).toEqual({ id: "prod_1", brandId: "brand_1" });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          brandId: "brand_1",
          categoryId: "cat_1",
          variants: { create: [{ name: "Regular", sku: "PP-MARG-REG", basePrice: "199.00", sortOrder: 0 }] },
        }),
      }),
    );
  });

  it("findOne() 404s instead of leaking a product from another organization", async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "prod_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("addVariant() refuses to add a variant to a product outside the caller's organization", async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(
      service.addVariant("org_1", "prod_from_org_2", { name: "Large", sku: "X-L", basePrice: "99.00" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.productVariant.create).not.toHaveBeenCalled();
  });
});
