import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CreateBrandDto } from "./dto/create-brand.dto.js";
import type { UpdateBrandDto } from "./dto/update-brand.dto.js";

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.brand.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
  }

  /** Scoped to organizationId so a brand from another tenant can never be read. */
  async findOne(organizationId: string, id: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");
    return brand;
  }

  async create(organizationId: string, dto: CreateBrandDto) {
    try {
      return await this.prisma.brand.create({
        data: { organizationId, name: dto.name, slug: dto.slug, description: dto.description },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateBrandDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.brand.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A brand with this slug already exists in this organization");
    }
    return err as Error;
  }
}
