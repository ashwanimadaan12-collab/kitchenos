import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import type { RiderInputDto, UpdateRiderDto } from "@kitchenos/shared";

@Injectable()
export class RidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, outletId?: string, includeInactive = false) {
    return this.prisma.deliveryRider.findMany({
      where: {
        organizationId,
        ...(outletId ? { outletId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async create(organizationId: string, dto: RiderInputDto) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: dto.outletId, organizationId },
    });
    if (!outlet) throw new NotFoundException("Outlet not found");
    return this.prisma.deliveryRider.create({
      data: {
        organizationId,
        outletId: dto.outletId,
        name: dto.name.trim(),
        phone: dto.phone ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateRiderDto) {
    await this.assertRider(organizationId, id);
    return this.prisma.deliveryRider.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        // `phone: null` clears the number; leaving the key out keeps it. An empty-string
        // body field would otherwise be indistinguishable from "don't touch it".
        ...(dto.phone === undefined ? {} : { phone: dto.phone ?? null }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Riders are deactivated, never deleted: past orders point at them, and the delivery
   * history of a boy who quit is exactly what an owner looks up when a customer complains.
   */
  async deactivate(organizationId: string, id: string) {
    await this.assertRider(organizationId, id);
    return this.prisma.deliveryRider.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertRider(organizationId: string, id: string) {
    const rider = await this.prisma.deliveryRider.findFirst({
      where: { id, organizationId },
    });
    if (!rider) throw new NotFoundException("Rider not found");
    return rider;
  }
}
