import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { PricingService } from "./pricing.service.js";

describe("PricingService", () => {
  let service: PricingService;
  let prisma: {
    outlet: { findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    outletProductPrice: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      outlet: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      outletProductPrice: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [PricingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PricingService);
  });

  it("listForOutlet() 404s instead of leaking prices for an outlet from another organization", async () => {
    prisma.outlet.findFirst.mockResolvedValue(null);
    await expect(service.listForOutlet("org_1", "outlet_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("refuses to price a variant that is not sold by the outlet's own brand", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1", brandId: "brand_1" });
    prisma.productVariant.findFirst.mockResolvedValue(null); // scoped lookup by brandId finds nothing

    await expect(service.setPrice("org_1", "outlet_1", "variant_other_brand", { price: "199.00" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
      where: { id: "variant_other_brand", product: { organizationId: "org_1", brandId: "brand_1" } },
    });
    expect(prisma.outletProductPrice.upsert).not.toHaveBeenCalled();
  });

  it("sets an outlet price override for a variant sold by the outlet's own brand", async () => {
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", organizationId: "org_1", brandId: "brand_1" });
    prisma.productVariant.findFirst.mockResolvedValue({ id: "variant_1" });
    prisma.outletProductPrice.upsert.mockResolvedValue({ id: "opp_1", price: "100.00" });

    const result = await service.setPrice("org_1", "outlet_1", "variant_1", { price: "100.00" });

    expect(result).toEqual({ id: "opp_1", price: "100.00" });
    expect(prisma.outletProductPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { outletId_variantId: { outletId: "outlet_1", variantId: "variant_1" } },
      }),
    );
  });
});
