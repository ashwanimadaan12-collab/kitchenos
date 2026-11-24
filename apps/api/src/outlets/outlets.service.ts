import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { PlanService } from "../plan/plan.service.js";
import type { CreateOutletDto } from "./dto/create-outlet.dto.js";
import type { UpdateOutletDto } from "./dto/update-outlet.dto.js";
import type { MapOutletKitchenDto } from "./dto/map-outlet-kitchen.dto.js";

@Injectable()
export class OutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
  ) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.outlet.findMany({
      where: { organizationId, ...(brandId ? { brandId } : {}) },
      orderBy: { name: "asc" },
      include: { brand: true, outletKitchens: { include: { kitchen: true } } },
    });
  }

  /** Scoped to organizationId so an outlet from another tenant can never be read. */
  async findOne(organizationId: string, id: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id, organizationId },
      include: { brand: true, outletKitchens: { include: { kitchen: true } } },
    });
    if (!outlet) throw new NotFoundException("Outlet not found");
    return outlet;
  }

  async create(organizationId: string, dto: CreateOutletDto) {
    const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
    if (!brand) throw new NotFoundException("Brand not found");

    // Checked before the insert so a workspace past its plan's outlet count is
    // told why, rather than finding out when a bill fails somewhere later.
    const existing = await this.prisma.outlet.count({ where: { organizationId } });
    await this.plans.assertWithinLimit(organizationId, "outlets", existing, "outlet");

    try {
      return await this.prisma.outlet.create({
        data: {
          organizationId,
          brandId: brand.id,
          name: dto.name,
          code: dto.code,
          address: dto.address,
          city: dto.city,
          gstin: dto.gstin,
          fssaiLicence: dto.fssaiLicence,
        },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdateOutletDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.outlet.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  /** Links a kitchen to an outlet. Both must belong to the caller's organization. */
  async mapKitchen(organizationId: string, outletId: string, dto: MapOutletKitchenDto) {
    await this.findOne(organizationId, outletId);
    const kitchen = await this.prisma.kitchen.findFirst({ where: { id: dto.kitchenId, organizationId } });
    if (!kitchen) throw new NotFoundException("Kitchen not found");

    return this.prisma.outletKitchen.upsert({
      where: { outletId_kitchenId: { outletId, kitchenId: kitchen.id } },
      update: { isPrimary: dto.isPrimary ?? false, isActive: true },
      create: { outletId, kitchenId: kitchen.id, isPrimary: dto.isPrimary ?? false },
      include: { kitchen: true },
    });
  }

  async unmapKitchen(organizationId: string, outletId: string, kitchenId: string) {
    await this.findOne(organizationId, outletId);
    await this.prisma.outletKitchen.deleteMany({ where: { outletId, kitchenId } });
    return { success: true } as const;
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("An outlet with this code already exists in this organization");
    }
    return err as Error;
  }
}
