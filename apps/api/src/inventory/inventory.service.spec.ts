import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { InventoryService } from "./inventory.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("InventoryService", () => {
  let service: InventoryService;
  let prisma: {
    kitchen: { findFirst: jest.Mock };
    ingredient: { findFirst: jest.Mock };
    stockBalance: { findMany: jest.Mock; upsert: jest.Mock };
    stockMovement: { findMany: jest.Mock; create: jest.Mock };
    outletKitchen: { findFirst: jest.Mock };
    recipe: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      kitchen: { findFirst: jest.fn() },
      ingredient: { findFirst: jest.fn() },
      stockBalance: { findMany: jest.fn(), upsert: jest.fn() },
      stockMovement: { findMany: jest.fn(), create: jest.fn() },
      outletKitchen: { findFirst: jest.fn() },
      recipe: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const module = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(InventoryService);
  });

  it("listStockForKitchen() 404s for a kitchen from another organization", async () => {
    prisma.kitchen.findFirst.mockResolvedValue(null);
    await expect(service.listStockForKitchen("org_1", "kitchen_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("adjustStock() 404s for an ingredient from another organization", async () => {
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1", organizationId: "org_1" });
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await expect(
      service.adjustStock("org_1", "kitchen_1", { ingredientId: "ing_from_org_2", type: "ADJUSTMENT", quantityDelta: "5" }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it("adjustStock() logs a movement and updates the balance", async () => {
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1", organizationId: "org_1" });
    prisma.ingredient.findFirst.mockResolvedValue({ id: "ing_1", organizationId: "org_1" });
    prisma.stockMovement.create.mockResolvedValue({ id: "mov_1" });
    prisma.stockBalance.upsert.mockResolvedValue({ id: "bal_1", quantityOnHand: D("5") });

    const result = await service.adjustStock("org_1", "kitchen_1", {
      ingredientId: "ing_1",
      type: "WASTAGE",
      quantityDelta: "-2",
    });

    expect(result).toEqual({ id: "bal_1", quantityOnHand: D("5") });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kitchenId: "kitchen_1", ingredientId: "ing_1", type: "WASTAGE" }),
      }),
    );
    expect(prisma.stockBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kitchenId_ingredientId: { kitchenId: "kitchen_1", ingredientId: "ing_1" } },
      }),
    );
  });

  it("consumeForOrderItem() is a no-op when the outlet has no primary kitchen", async () => {
    prisma.outletKitchen.findFirst.mockResolvedValue(null);
    await service.consumeForOrderItem("org_1", "outlet_1", "item_1", "variant_1", 2);
    expect(prisma.recipe.findFirst).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it("consumeForOrderItem() is a no-op when the variant has no recipe", async () => {
    prisma.outletKitchen.findFirst.mockResolvedValue({ kitchenId: "kitchen_1" });
    prisma.recipe.findFirst.mockResolvedValue(null);
    await service.consumeForOrderItem("org_1", "outlet_1", "item_1", "variant_1", 2);
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it("consumeForOrderItem() deducts each recipe ingredient line, scaled by quantity", async () => {
    prisma.outletKitchen.findFirst.mockResolvedValue({ kitchenId: "kitchen_1" });
    prisma.recipe.findFirst.mockResolvedValue({
      ingredients: [{ ingredientId: "ing_1", quantity: D("0.3") }],
    });
    prisma.stockMovement.create.mockResolvedValue({ id: "mov_1" });
    prisma.stockBalance.upsert.mockResolvedValue({ id: "bal_1" });

    await service.consumeForOrderItem("org_1", "outlet_1", "item_1", "variant_1", 2);

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CONSUMPTION",
          quantityDelta: D("-0.6"),
          referenceType: "OrderItem",
          referenceId: "item_1",
        }),
      }),
    );
  });

  it("consumeForOrderItem() never throws even if something fails internally", async () => {
    prisma.outletKitchen.findFirst.mockRejectedValue(new Error("db exploded"));
    await expect(service.consumeForOrderItem("org_1", "outlet_1", "item_1", "variant_1", 1)).resolves.toBeUndefined();
  });

  it("reverseForOrderItem() creates an offsetting ADJUSTMENT for each consumed movement", async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      { kitchenId: "kitchen_1", ingredientId: "ing_1", quantityDelta: D("-0.6") },
    ]);
    prisma.stockMovement.create.mockResolvedValue({ id: "mov_2" });
    prisma.stockBalance.upsert.mockResolvedValue({ id: "bal_1" });

    await service.reverseForOrderItem("org_1", "item_1");

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ADJUSTMENT", quantityDelta: D("0.6") }),
      }),
    );
  });

  it("recordReceipt() logs a RECEIPT movement", async () => {
    prisma.stockMovement.create.mockResolvedValue({ id: "mov_1" });
    prisma.stockBalance.upsert.mockResolvedValue({ id: "bal_1" });

    await service.recordReceipt("org_1", "kitchen_1", "ing_1", D("10"), "po_item_1");

    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RECEIPT",
          quantityDelta: D("10"),
          referenceType: "PurchaseOrderItem",
          referenceId: "po_item_1",
        }),
      }),
    );
  });
});
