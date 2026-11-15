import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { LoyaltyService } from "../loyalty/loyalty.service.js";
import type { CreateCustomerDto } from "./dto/create-customer.dto.js";
import type { UpdateCustomerDto } from "./dto/update-customer.dto.js";

const ORDER_HISTORY_INCLUDE = {
  outlet: true,
  items: { where: { status: "ACTIVE" as const } },
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async list(organizationId: string) {
    return this.prisma.customer.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async findOne(organizationId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, organizationId } });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async orderHistory(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.order.findMany({
      where: { customerId: id, organizationId },
      orderBy: { createdAt: "desc" },
      include: ORDER_HISTORY_INCLUDE,
    });
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    if (dto.referredByCustomerId) {
      const referrer = await this.prisma.customer.findFirst({
        where: { id: dto.referredByCustomerId, organizationId },
      });
      if (!referrer) throw new NotFoundException("Referring customer not found");
    }
    let customer;
    try {
      customer = await this.prisma.customer.create({ data: { organizationId, ...dto } });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
    await this.loyalty.grantWelcomeBonus(organizationId, customer.id);
    // Re-fetch rather than return the pre-bonus snapshot — grantWelcomeBonus may have just
    // incremented loyaltyPoints/lifetimePoints, and the caller should see the real balance.
    return this.findOne(organizationId, customer.id);
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(organizationId, id);
    try {
      return await this.prisma.customer.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A customer with this phone number already exists in this organization");
    }
    return err as Error;
  }
}
