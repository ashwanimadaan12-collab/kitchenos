import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { InventoryService } from "../inventory/inventory.service.js";
import { PurchaseOrdersService } from "./purchase-orders.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("PurchaseOrdersService", () => {
  let service: PurchaseOrdersService;
  let prisma: {
    supplier: { findFirst: jest.Mock };
    kitchen: { findFirst: jest.Mock };
    ingredient: { findMany: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock; update: jest.Mock };
    purchaseOrderItem: { update: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let inventory: { recordReceipt: jest.Mock };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn() },
      kitchen: { findFirst: jest.fn() },
      ingredient: { findMany: jest.fn() },
      purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
      purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    inventory = { recordReceipt: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: inventory },
      ],
    }).compile();
    service = module.get(PurchaseOrdersService);
  });

  const createDto = {
    supplierId: "sup_1",
    kitchenId: "kitchen_1",
    items: [{ ingredientId: "ing_1", quantityOrdered: "10", unitCost: "5.00" }],
  };

  it("create() 404s for a supplier from another organization", async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", "user_1", createDto)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("create() 404s for a kitchen from another organization", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: "sup_1" });
    prisma.kitchen.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", "user_1", createDto)).rejects.toThrow(NotFoundException);
  });

  it("create() 404s if an ingredient does not belong to the organization", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: "sup_1" });
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1" });
    prisma.ingredient.findMany.mockResolvedValue([]); // none found for the requested id
    await expect(service.create("org_1", "user_1", createDto)).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("create() assigns the next order number inside one transaction", async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: "sup_1" });
    prisma.kitchen.findFirst.mockResolvedValue({ id: "kitchen_1" });
    prisma.ingredient.findMany.mockResolvedValue([{ id: "ing_1" }]);
    const tx = {
      orgPurchaseOrderSequence: { upsert: jest.fn().mockResolvedValue({ organizationId: "org_1", lastNumber: 3 }) },
      purchaseOrder: { create: jest.fn().mockResolvedValue({ id: "po_1", orderNumber: 3 }) },
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await service.create("org_1", "user_1", createDto);

    expect(result).toEqual({ id: "po_1", orderNumber: 3 });
    expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderNumber: 3, supplierId: "sup_1" }) }),
    );
  });

  it("submit() refuses to submit a non-DRAFT purchase order", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po_1", organizationId: "org_1", status: "ORDERED", items: [] });
    await expect(service.submit("org_1", "po_1")).rejects.toThrow(ConflictException);
  });

  it("receiveItem() refuses to receive against a DRAFT purchase order", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: "po_1",
      organizationId: "org_1",
      status: "DRAFT",
      items: [{ id: "item_1", ingredientId: "ing_1", quantityOrdered: D("10"), quantityReceived: D("0") }],
    });
    await expect(service.receiveItem("org_1", "po_1", "item_1", { quantity: "5" })).rejects.toThrow(
      ConflictException,
    );
  });

  it("receiveItem() refuses to receive more than was ordered", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: "po_1",
      organizationId: "org_1",
      kitchenId: "kitchen_1",
      status: "ORDERED",
      items: [{ id: "item_1", ingredientId: "ing_1", quantityOrdered: D("10"), quantityReceived: D("8") }],
    });
    await expect(service.receiveItem("org_1", "po_1", "item_1", { quantity: "5" })).rejects.toThrow(
      BadRequestException,
    );
    expect(inventory.recordReceipt).not.toHaveBeenCalled();
  });

  it("receiveItem() records the receipt and rolls the order up to PARTIALLY_RECEIVED", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: "po_1",
      organizationId: "org_1",
      kitchenId: "kitchen_1",
      status: "ORDERED",
      items: [
        { id: "item_1", ingredientId: "ing_1", quantityOrdered: D("10"), quantityReceived: D("0") },
        { id: "item_2", ingredientId: "ing_2", quantityOrdered: D("5"), quantityReceived: D("0") },
      ],
    });
    prisma.purchaseOrderItem.findMany.mockResolvedValue([
      { quantityOrdered: D("10"), quantityReceived: D("4") },
      { quantityOrdered: D("5"), quantityReceived: D("0") },
    ]);

    await service.receiveItem("org_1", "po_1", "item_1", { quantity: "4" });

    expect(inventory.recordReceipt).toHaveBeenCalledWith("org_1", "kitchen_1", "ing_1", D("4"), "item_1");
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PARTIALLY_RECEIVED" } }),
    );
  });

  it("cancel() refuses to cancel an already-received purchase order", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po_1", organizationId: "org_1", status: "RECEIVED", items: [] });
    await expect(service.cancel("org_1", "po_1")).rejects.toThrow(ConflictException);
  });
});
