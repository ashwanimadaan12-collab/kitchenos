import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateProductCategoryDto } from "./dto/create-product-category.dto.js";
import type { UpdateProductCategoryDto } from "./dto/update-product-category.dto.js";

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.productCategory.findMany({
      where: { organizationId, ...(brandId ? { brandId } : {}) },
      orderBy: [{ brandId: "asc" }, { sortOrder: "asc" }],
    });
  }

  async findOne(organizationId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({ where: { id, organizationId } });
    if (!category) throw new NotFoundException("Product category not found");
    return category;
  }

  async create(organizationId: string, dto: CreateProductCategoryDto) {
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    try {
      return await this.prisma.productCategory.create({
        data: { organizationId, brandId: brand.id, name: dto.name, sortOrder: dto.sortOrder },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateProductCategoryDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.productCategory.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A category with this name already exists for this brand");
    }
    return err as Error;
  }
}
