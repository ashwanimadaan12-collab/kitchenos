import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { SetOutletProductPriceDto } from "./dto/set-outlet-product-price.dto.js";

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Outlet-level price overrides, with the variant's own base price for comparison. */
  async listForOutlet(organizationId: string, outletId: string) {
    await this.assertOutletBelongsToOrg(organizationId, outletId);
    return this.prisma.outletProductPrice.findMany({
      where: { outletId },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Sets (or replaces) the outlet's override price for a variant sold by the outlet's own brand. */
  async setPrice(organizationId: string, outletId: string, variantId: string, dto: SetOutletProductPriceDto) {
    const outlet = await this.assertOutletBelongsToOrg(organizationId, outletId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { organizationId, brandId: outlet.brandId } },
    });
    if (!variant) throw new NotFoundException("Product variant not found for this outlet's brand");

    return this.prisma.outletProductPrice.upsert({
      where: { outletId_variantId: { outletId, variantId } },
      update: { price: dto.price, isActive: true },
      create: { organizationId, outletId, variantId, price: dto.price },
      include: { variant: { include: { product: true } } },
    });
  }

  async removePrice(organizationId: string, outletId: string, variantId: string) {
    await this.assertOutletBelongsToOrg(organizationId, outletId);
    await this.prisma.outletProductPrice.deleteMany({ where: { outletId, variantId } });
    return { success: true } as const;
  }

  private async assertOutletBelongsToOrg(organizationId: string, outletId: string) {
    return assertBelongsToOrg(
      () => this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } }),
      "Outlet",
    );
  }
}
