import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import type { UpdateSupplierDto } from "./dto/update-supplier.dto.js";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async findOne(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async create(organizationId: string, dto: CreateSupplierDto) {
    try {
      return await this.prisma.supplier.create({ data: { organizationId, ...dto } });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.supplier.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A supplier with this name already exists in this organization");
    }
    return err as Error;
  }
}
