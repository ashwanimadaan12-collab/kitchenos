import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, PrismaService, type CustomerSegment } from "@kitchenos/database";
import type { CreateCustomerSegmentDto, UpdateCustomerSegmentDto } from "@kitchenos/shared";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";

/**
 * Segments resolve to a customer list on demand — the same "computed, not cached" tradeoff
 * as the Prompt 10 reports. A stored membership list would drift stale the moment a customer
 * places another order; recomputing is cheap at this data volume.
 */
@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.customerSegment.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async findOne(organizationId: string, id: string) {
    return assertBelongsToOrg(
      () => this.prisma.customerSegment.findFirst({ where: { id, organizationId } }),
      "Customer segment",
    );
  }

  async create(organizationId: string, dto: CreateCustomerSegmentDto) {
    if (dto.type === "BRAND_PREFERENCE") {
      await assertBelongsToOrg(() => this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } }), "Brand");
    }
    if (dto.type === "LOYALTY_TIER") {
      await assertBelongsToOrg(
        () => this.prisma.loyaltyTier.findFirst({ where: { id: dto.loyaltyTierId, organizationId } }),
        "Loyalty tier",
      );
    }
    try {
      return await this.prisma.customerSegment.create({ data: { organizationId, ...dto } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("A segment with this name already exists");
      }
      throw err;
    }
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerSegmentDto) {
    const segment = await this.findOne(organizationId, id);
    if (dto.brandId && segment.type === "BRAND_PREFERENCE") {
      await assertBelongsToOrg(() => this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } }), "Brand");
    }
    if (dto.loyaltyTierId && segment.type === "LOYALTY_TIER") {
      await assertBelongsToOrg(
        () => this.prisma.loyaltyTier.findFirst({ where: { id: dto.loyaltyTierId, organizationId } }),
        "Loyalty tier",
      );
    }
    return this.prisma.customerSegment.update({ where: { id }, data: dto });
  }

  /** Resolves which customers currently match this segment — see CustomerSegment's own docs for what each type reads. */
  async resolveCustomerIds(organizationId: string, segment: CustomerSegment): Promise<string[]> {
    switch (segment.type) {
      case "ALL":
        return this.allCustomerIds(organizationId);
      case "INACTIVE":
        return this.inactiveCustomerIds(organizationId, segment.inactiveDays ?? 90);
      case "REPEAT":
        return this.repeatCustomerIds(organizationId, segment.minOrders ?? 2);
      case "BRAND_PREFERENCE":
        return segment.brandId ? this.brandPreferenceCustomerIds(organizationId, segment.brandId) : [];
      case "TOTAL_SPEND":
        return this.totalSpendCustomerIds(organizationId, segment.minSpend ?? new Prisma.Decimal(0));
      case "LOYALTY_TIER":
        return segment.loyaltyTierId ? this.loyaltyTierCustomerIds(organizationId, segment.loyaltyTierId) : [];
      case "BIRTHDAY_THIS_WEEK":
        return this.birthdayThisWeekCustomerIds(organizationId);
    }
  }

  private async allCustomerIds(organizationId: string): Promise<string[]> {
    const customers = await this.prisma.customer.findMany({ where: { organizationId }, select: { id: true } });
    return customers.map((c) => c.id);
  }

  private async inactiveCustomerIds(organizationId: string, inactiveDays: number): Promise<string[]> {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, orders: { none: { status: "PAID", closedAt: { gte: cutoff } } } },
      select: { id: true },
    });
    return customers.map((c) => c.id);
  }

  private async repeatCustomerIds(organizationId: string, minOrders: number): Promise<string[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: { organizationId, status: "PAID", customerId: { not: null } },
      _count: { _all: true },
      having: { customerId: { _count: { gte: minOrders } } },
    });
    return grouped.map((g) => g.customerId as string);
  }

  /** The brand a customer has placed the most PAID orders with — grouped in application code
   *  (small data volume, same tradeoff as topProducts/comboPerformance in the Prompt 10 reports). */
  private async brandPreferenceCustomerIds(organizationId: string, brandId: string): Promise<string[]> {
    const orders = await this.prisma.order.findMany({
      where: { organizationId, status: "PAID", customerId: { not: null } },
      select: { customerId: true, outlet: { select: { brandId: true } } },
    });
    const countsByCustomer = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const customerId = order.customerId as string;
      const counts = countsByCustomer.get(customerId) ?? new Map<string, number>();
      counts.set(order.outlet.brandId, (counts.get(order.outlet.brandId) ?? 0) + 1);
      countsByCustomer.set(customerId, counts);
    }
    const matches: string[] = [];
    for (const [customerId, counts] of countsByCustomer) {
      const topBrand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topBrand === brandId) matches.push(customerId);
    }
    return matches;
  }

  private async totalSpendCustomerIds(organizationId: string, minSpend: Prisma.Decimal): Promise<string[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: { organizationId, status: "PAID", customerId: { not: null } },
      _sum: { total: true },
    });
    return grouped.filter((g) => (g._sum.total ?? new Prisma.Decimal(0)).gte(minSpend)).map((g) => g.customerId as string);
  }

  private async loyaltyTierCustomerIds(organizationId: string, loyaltyTierId: string): Promise<string[]> {
    const tiers = await this.prisma.loyaltyTier.findMany({ where: { organizationId } });
    const customers = await this.prisma.customer.findMany({ where: { organizationId }, select: { id: true, lifetimePoints: true } });
    const matches: string[] = [];
    for (const customer of customers) {
      const eligible = tiers
        .filter((t) => t.minLifetimePoints <= customer.lifetimePoints)
        .sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
      if (eligible[0]?.id === loyaltyTierId) matches.push(customer.id);
    }
    return matches;
  }

  private async birthdayThisWeekCustomerIds(organizationId: string): Promise<string[]> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, birthday: { not: null } },
      select: { id: true, birthday: true },
    });
    const today = new Date();
    const matches: string[] = [];
    for (const customer of customers) {
      if (!customer.birthday) continue;
      for (let offset = 0; offset < 7; offset++) {
        const day = new Date(today);
        day.setUTCDate(day.getUTCDate() + offset);
        if (customer.birthday.getUTCMonth() === day.getUTCMonth() && customer.birthday.getUTCDate() === day.getUTCDate()) {
          matches.push(customer.id);
          break;
        }
      }
    }
    return matches;
  }
}
