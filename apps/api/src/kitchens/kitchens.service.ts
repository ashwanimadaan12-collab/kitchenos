import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { CreateKitchenDto } from "./dto/create-kitchen.dto.js";
import type { UpdateKitchenDto } from "./dto/update-kitchen.dto.js";
import type { CreateKitchenStationDto } from "./dto/create-kitchen-station.dto.js";
import type { UpdateKitchenStationDto } from "./dto/update-kitchen-station.dto.js";
import type { MapBrandKitchenDto } from "./dto/map-brand-kitchen.dto.js";

@Injectable()
export class KitchensService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.kitchen.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { stations: true, brandKitchens: { include: { brand: true } } },
    });
  }

  /** Scoped to organizationId so a kitchen from another tenant can never be read. */
  async findOne(organizationId: string, id: string) {
    const kitchen = await this.prisma.kitchen.findFirst({
      where: { id, organizationId },
      include: { stations: true, brandKitchens: { include: { brand: true } } },
    });
    if (!kitchen) throw new NotFoundException("Kitchen not found");
    return kitchen;
  }

  async create(organizationId: string, dto: CreateKitchenDto) {
    try {
      return await this.prisma.kitchen.create({
        data: { organizationId, name: dto.name, code: dto.code, kind: dto.kind },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A kitchen with this code already exists in this organization");
    }
  }

  async update(organizationId: string, id: string, dto: UpdateKitchenDto) {
    await this.assertBelongsToOrg(organizationId, id);
    try {
      return await this.prisma.kitchen.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err, "A kitchen with this code already exists in this organization");
    }
  }

  async addStation(organizationId: string, kitchenId: string, dto: CreateKitchenStationDto) {
    await this.assertBelongsToOrg(organizationId, kitchenId);
    try {
      return await this.prisma.kitchenStation.create({
        data: { kitchenId, name: dto.name, code: dto.code },
      });
    } catch (err) {
      throw this.mapUniqueError(err, "A station with this code already exists in this kitchen");
    }
  }

  async updateStation(
    organizationId: string,
    kitchenId: string,
    stationId: string,
    dto: UpdateKitchenStationDto,
  ) {
    await this.assertBelongsToOrg(organizationId, kitchenId);
    const station = await this.prisma.kitchenStation.findFirst({ where: { id: stationId, kitchenId } });
    if (!station) throw new NotFoundException("Kitchen station not found");
    try {
      return await this.prisma.kitchenStation.update({ where: { id: stationId }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err, "A station with this code already exists in this kitchen");
    }
  }

  /** Links a brand to a kitchen. Both must belong to the caller's organization. */
  async mapBrand(organizationId: string, kitchenId: string, dto: MapBrandKitchenDto) {
    await this.assertBelongsToOrg(organizationId, kitchenId);
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    return this.prisma.brandKitchen.upsert({
      where: { brandId_kitchenId: { brandId: brand.id, kitchenId } },
      update: { isPrimary: dto.isPrimary ?? false, isActive: true },
      create: { brandId: brand.id, kitchenId, isPrimary: dto.isPrimary ?? false },
      include: { brand: true },
    });
  }

  async unmapBrand(organizationId: string, kitchenId: string, brandId: string) {
    await this.assertBelongsToOrg(organizationId, kitchenId);
    await this.prisma.brandKitchen.deleteMany({ where: { kitchenId, brandId } });
    return { success: true } as const;
  }

  private async assertBelongsToOrg(organizationId: string, kitchenId: string) {
    return assertBelongsToOrg(
      () => this.prisma.kitchen.findFirst({ where: { id: kitchenId, organizationId } }),
      "Kitchen",
    );
  }

  private mapUniqueError(err: unknown, message: string): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException(message);
    }
    return err as Error;
  }
}
