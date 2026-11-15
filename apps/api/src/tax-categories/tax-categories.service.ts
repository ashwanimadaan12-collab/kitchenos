import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateTaxCategoryDto } from "./dto/create-tax-category.dto.js";
import type { UpdateTaxCategoryDto } from "./dto/update-tax-category.dto.js";

@Injectable()
export class TaxCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.taxCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async findOne(organizationId: string, id: string) {
    const category = await this.prisma.taxCategory.findFirst({ where: { id, organizationId } });
    if (!category) throw new NotFoundException("Tax category not found");
    return category;
  }

  async create(organizationId: string, dto: CreateTaxCategoryDto) {
    try {
      return await this.prisma.taxCategory.create({
        data: { organizationId, name: dto.name, ratePercent: dto.ratePercent },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateTaxCategoryDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.taxCategory.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A tax category with this name already exists in this organization");
    }
    return err as Error;
  }
}
