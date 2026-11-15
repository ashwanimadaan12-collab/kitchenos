import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CombosService } from "./combos.service.js";

describe("CombosService", () => {
  let service: CombosService;
  let prisma: {
    combo: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    productVariant: { findMany: jest.Mock; findFirst: jest.Mock };
    comboItem: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      combo: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      productVariant: { findMany: jest.fn(), findFirst: jest.fn() },
      comboItem: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [CombosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CombosService);
  });

  it("findOne() 404s instead of leaking a combo from another organization", async () => {
    prisma.combo.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "combo_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("create() 404s when the brand does not belong to the caller's organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(
      service.create("org_1", {
        brandId: "brand_from_org_2",
        name: "Combo",
        comboPrice: "100.00",
        items: [
          { variantId: "v1", quantity: 1 },
          { variantId: "v2", quantity: 1 },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("create() rejects the same variant listed twice", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1" });
    await expect(
      service.create("org_1", {
        brandId: "brand_1",
        name: "Combo",
        comboPrice: "100.00",
        items: [
          { variantId: "v1", quantity: 1 },
          { variantId: "v1", quantity: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.combo.create).not.toHaveBeenCalled();
  });

  it("create() 404s when a component variant does not belong to the combo's brand", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1" });
    prisma.productVariant.findMany.mockResolvedValue([{ id: "v1" }]); // only one of the two found

    await expect(
      service.create("org_1", {
        brandId: "brand_1",
        name: "Combo",
        comboPrice: "100.00",
        items: [
          { variantId: "v1", quantity: 1 },
          { variantId: "v2", quantity: 1 },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.combo.create).not.toHaveBeenCalled();
  });

  it("create() builds the combo with its nested items in one call", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1" });
    prisma.productVariant.findMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
    prisma.combo.create.mockResolvedValue({ id: "combo_1" });

    await service.create("org_1", {
      brandId: "brand_1",
      name: "Pizza + Coke Combo",
      comboPrice: "299.00",
      items: [
        { variantId: "v1", quantity: 1 },
        { variantId: "v2", quantity: 2 },
      ],
    });

    expect(prisma.combo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          brandId: "brand_1",
          comboPrice: "299.00",
          items: {
            create: [
              { variantId: "v1", quantity: 1 },
              { variantId: "v2", quantity: 2 },
            ],
          },
        }),
      }),
    );
  });

  it("create() maps a duplicate-name database error to a 409 Conflict", async () => {
    prisma.brand.findFirst.mockResolvedValue({ id: "brand_1" });
    prisma.productVariant.findMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
    prisma.combo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );

    await expect(
      service.create("org_1", {
        brandId: "brand_1",
        name: "Combo",
        comboPrice: "100.00",
        items: [
          { variantId: "v1", quantity: 1 },
          { variantId: "v2", quantity: 1 },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("removeItem() refuses to drop a combo below two components", async () => {
    prisma.combo.findFirst.mockResolvedValue({
      id: "combo_1",
      items: [{ variantId: "v1" }, { variantId: "v2" }],
    });

    await expect(service.removeItem("org_1", "combo_1", "v1")).rejects.toThrow(ConflictException);
    expect(prisma.comboItem.deleteMany).not.toHaveBeenCalled();
  });

  it("removeItem() allows removal when at least two components remain afterwards", async () => {
    prisma.combo.findFirst.mockResolvedValue({
      id: "combo_1",
      items: [{ variantId: "v1" }, { variantId: "v2" }, { variantId: "v3" }],
    });
    prisma.comboItem.deleteMany.mockResolvedValue({ count: 1 });

    await service.removeItem("org_1", "combo_1", "v1");
    expect(prisma.comboItem.deleteMany).toHaveBeenCalledWith({ where: { comboId: "combo_1", variantId: "v1" } });
  });
});
