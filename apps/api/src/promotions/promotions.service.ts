import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService, type Order } from "@kitchenos/database";
import type { CreatePromotionDto } from "./dto/create-promotion.dto.js";
import type { UpdatePromotionDto } from "./dto/update-promotion.dto.js";

const { Decimal } = Prisma;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, brandId?: string) {
    return this.prisma.promotion.findMany({
      where: { organizationId, ...(brandId ? { OR: [{ brandId }, { brandId: null }] } : {}) },
      orderBy: { createdAt: "desc" },
      include: { brand: true },
    });
  }

  async findOne(organizationId: string, id: string) {
    const promotion = await this.prisma.promotion.findFirst({ where: { id, organizationId }, include: { brand: true } });
    if (!promotion) throw new NotFoundException("Promotion not found");
    return promotion;
  }

  async create(organizationId: string, dto: CreatePromotionDto) {
    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } });
      if (!brand) throw new NotFoundException("Brand not found");
    }

    try {
      return await this.prisma.promotion.create({
        data: {
          organizationId,
          brandId: dto.brandId,
          code: dto.code.toUpperCase(),
          description: dto.description,
          type: dto.type,
          value: dto.value,
          minOrderSubtotal: dto.minOrderSubtotal,
          maxDiscountAmount: dto.maxDiscountAmount,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          usageLimit: dto.usageLimit,
        },
        include: { brand: true },
      });
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(organizationId: string, id: string, dto: UpdatePromotionDto) {
    await this.findOne(organizationId, id);
    return this.prisma.promotion.update({ where: { id }, data: dto, include: { brand: true } });
  }

  /**
   * Validates a code against one open order and returns the promotion plus
   * the discount it would produce — never mutates anything. The caller
   * (OrdersService) decides how/whether to apply it, since it alone owns
   * the order's totals.
   */
  async validateAndComputeDiscount(organizationId: string, order: Order & { outlet: { brandId: string } }, code: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { organizationId, code: code.toUpperCase() },
    });
    if (!promotion) throw new NotFoundException("Promotion code not found");
    if (!promotion.isActive) throw new ConflictException("This promotion is no longer active");
    if (promotion.brandId && promotion.brandId !== order.outlet.brandId) {
      throw new ConflictException("This promotion does not apply to this outlet's brand");
    }
    const now = new Date();
    if (promotion.startsAt && now < promotion.startsAt) {
      throw new ConflictException("This promotion has not started yet");
    }
    if (promotion.endsAt && now > promotion.endsAt) {
      throw new ConflictException("This promotion has expired");
    }
    if (promotion.minOrderSubtotal && order.subtotal.lt(promotion.minOrderSubtotal)) {
      throw new BadRequestException(`Order subtotal must be at least ${promotion.minOrderSubtotal.toString()} to use this code`);
    }
    // This is only a cheap up-front rejection for the common case — it's a plain read, so two
    // concurrent applies can both pass it when exactly one slot is left. The limit is actually
    // enforced atomically inside recordRedemption, which runs right after this in the same request.
    if (promotion.usageLimit !== null) {
      const redemptionCount = await this.prisma.promotionRedemption.count({ where: { promotionId: promotion.id } });
      if (redemptionCount >= promotion.usageLimit) {
        throw new ConflictException("This promotion has reached its usage limit");
      }
    }

    const billBeforeDiscount = order.subtotal.add(order.taxTotal);
    let discountAmount =
      promotion.type === "PERCENTAGE" ? order.subtotal.mul(promotion.value).div(100) : new Decimal(promotion.value);
    if (promotion.maxDiscountAmount) discountAmount = Decimal.min(discountAmount, promotion.maxDiscountAmount);
    discountAmount = Decimal.min(discountAmount, billBeforeDiscount);

    return { promotion, discountAmount };
  }

  /**
   * The authoritative usage-limit check. Runs the re-count and the insert inside one
   * Serializable transaction, so two concurrent redemptions for the same promotion can't
   * both read "one slot left" and both insert — Postgres aborts the loser with a
   * serialization failure (P2034), which we surface as the same "limit reached" conflict.
   */
  async recordRedemption(organizationId: string, orderId: string, promotionId: string, discountAmount: Prisma.Decimal) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const promotion = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId } });
          if (promotion.usageLimit !== null) {
            const redemptionCount = await tx.promotionRedemption.count({ where: { promotionId } });
            if (redemptionCount >= promotion.usageLimit) {
              throw new ConflictException("This promotion has reached its usage limit");
            }
          }
          return tx.promotionRedemption.create({
            data: { organizationId, orderId, promotionId, discountAmount },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("A promotion is already applied to this order");
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("This promotion has reached its usage limit");
      }
      throw err;
    }
  }

  async clearRedemption(organizationId: string, orderId: string) {
    await this.prisma.promotionRedemption.deleteMany({ where: { organizationId, orderId } });
  }

  private mapUniqueError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new ConflictException("A promotion with this code already exists in this organization");
    }
    return err as Error;
  }
}
