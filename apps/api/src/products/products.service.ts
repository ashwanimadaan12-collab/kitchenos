import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateProductDto } from "./dto/create-product.dto.js";
import type { UpdateProductDto } from "./dto/update-product.dto.js";
import type { CreateProductVariantDto } from "./dto/create-product-variant.dto.js";
import type { UpdateProductVariantDto } from "./dto/update-product-variant.dto.js";

const PRODUCT_INCLUDE = {
  category: true,
  taxCategory: true,
  variants: { orderBy: { sortOrder: "asc" as const } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string, categoryId?: string) {
    return this.prisma.product.findMany({
      where: { organizationId, ...(brandId ? { brandId } : {}), ...(categoryId ? { categoryId } : {}) },
      orderBy: { name: "asc" },
      include: PRODUCT_INCLUDE,
    });
  }

  /** Scoped to organizationId so a product from another tenant can never be read. */
  async findOne(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async create(organizationId: string, dto: CreateProductDto) {
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    const category = await this.prisma.productCategory.findFirst({
      where: { id: dto.categoryId, organizationId, brandId: brand.id },
    });
    if (!category) throw new NotFoundException("Product category not found for this brand");

    if (dto.taxCategoryId) {
      const taxCategory = await this.prisma.taxCategory.findFirst({
        where: { id: dto.taxCategoryId, organizationId },
      });
      if (!taxCategory) throw new NotFoundException("Tax category not found");
    }

    try {
      return await this.prisma.product.create({
        data: {
          organizationId,
          brandId: brand.id,
          categoryId: category.id,
          taxCategoryId: dto.taxCategoryId,
          name: dto.name,
          sku: dto.sku,
          description: dto.description,
          variants: {
            create: dto.variants.map((v, i) => ({
              name: v.name,
              sku: v.sku,
              basePrice: v.basePrice,
              sortOrder: v.sortOrder ?? i,
              kind: v.kind,
              purchasePrice: v.purchasePrice,
              supplierPrice: v.supplierPrice,
              landedCost: v.landedCost,
              printedMRP: v.printedMRP,
            })),
          },
        },
        include: PRODUCT_INCLUDE,
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A product with this SKU already exists for this brand");
    }
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    const product = await this.findOne(organizationId, id);

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, organizationId, brandId: product.brandId },
      });
      if (!category) throw new NotFoundException("Product category not found for this brand");
    }
    if (dto.taxCategoryId) {
      const taxCategory = await this.prisma.taxCategory.findFirst({
        where: { id: dto.taxCategoryId, organizationId },
      });
      if (!taxCategory) throw new NotFoundException("Tax category not found");
    }

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          taxCategoryId: dto.taxCategoryId,
          name: dto.name,
          sku: dto.sku,
          description: dto.description,
          isActive: dto.isActive,
        },
        include: PRODUCT_INCLUDE,
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A product with this SKU already exists for this brand");
    }
  }

  async addVariant(organizationId: string, productId: string, dto: CreateProductVariantDto) {
    await this.findOne(organizationId, productId);
    try {
      return await this.prisma.productVariant.create({
        data: {
          productId,
          name: dto.name,
          sku: dto.sku,
          basePrice: dto.basePrice,
          sortOrder: dto.sortOrder,
          kind: dto.kind,
          purchasePrice: dto.purchasePrice,
          supplierPrice: dto.supplierPrice,
          landedCost: dto.landedCost,
          printedMRP: dto.printedMRP,
        },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A variant with this name or SKU already exists for this product");
    }
  }

  async updateVariant(organizationId: string, productId: string, variantId: string, dto: UpdateProductVariantDto) {
    await this.findOne(organizationId, productId);
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException("Product variant not found");

    try {
      return await this.prisma.productVariant.update({ where: { id: variantId }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err, "A variant with this name or SKU already exists for this product");
    }
  }

  private mapUniqueError(err: unknown, message: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException(message);
    }
    return err as Error;
  }
}
