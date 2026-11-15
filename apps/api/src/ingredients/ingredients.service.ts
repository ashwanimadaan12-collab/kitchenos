import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateIngredientDto } from "./dto/create-ingredient.dto.js";
import type { UpdateIngredientDto } from "./dto/update-ingredient.dto.js";

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, kind?: string) {
    return this.prisma.ingredient.findMany({
      where: { organizationId, ...(kind ? { kind: kind as "RAW_MATERIAL" | "PACKAGING" } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async findOne(organizationId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({ where: { id, organizationId } });
    if (!ingredient) throw new NotFoundException("Ingredient not found");
    return ingredient;
  }

  async create(organizationId: string, dto: CreateIngredientDto) {
    if (dto.preferredSupplierId) await this.assertSupplierBelongsToOrg(organizationId, dto.preferredSupplierId);
    try {
      return await this.prisma.ingredient.create({
        data: {
          organizationId,
          name: dto.name,
          sku: dto.sku,
          kind: dto.kind,
          unit: dto.unit,
          preferredSupplierId: dto.preferredSupplierId,
          shelfLifeDays: dto.shelfLifeDays,
        },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateIngredientDto) {
    await this.findOne(organizationId, id);
    if (dto.preferredSupplierId) await this.assertSupplierBelongsToOrg(organizationId, dto.preferredSupplierId);
    try {
      return await this.prisma.ingredient.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private async assertSupplierBelongsToOrg(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("An ingredient with this SKU already exists in this organization");
    }
    return err as Error;
  }
}
