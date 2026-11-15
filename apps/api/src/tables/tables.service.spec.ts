import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { OrdersService } from "../orders/orders.service.js";
import { TablesService } from "./tables.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("TablesService", () => {
  let service: TablesService;
  let orders: { create: jest.Mock; addItem: jest.Mock; findOne: jest.Mock };
  let prisma: {
    restaurantTable: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    order: { findMany: jest.Mock; findFirst: jest.Mock };
    outlet: { findFirst: jest.Mock };
    menu: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      restaurantTable: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
      order: { findMany: jest.fn(), findFirst: jest.fn() },
      outlet: { findFirst: jest.fn() },
      menu: { findMany: jest.fn() },
    };
    orders = { create: jest.fn(), addItem: jest.fn(), findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: orders },
      ],
    }).compile();
    service = module.get(TablesService);
  });

  describe("admin CRUD", () => {
    it("create() 404s for an outlet from another organization", async () => {
      prisma.outlet.findFirst.mockResolvedValue(null);
      await expect(service.create("org_1", { outletId: "outlet_from_org_2", name: "T1" })).rejects.toThrow(NotFoundException);
    });

    it("create() surfaces a conflict for a duplicate table name at the same outlet", async () => {
      prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1" });
      prisma.restaurantTable.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      await expect(service.create("org_1", { outletId: "outlet_1", name: "T1" })).rejects.toThrow(ConflictException);
    });

    it("list() reports each table's open order, if it has one", async () => {
      prisma.restaurantTable.findMany.mockResolvedValue([
        { id: "table_1", name: "T1" },
        { id: "table_2", name: "T2" },
      ]);
      prisma.order.findMany.mockResolvedValue([{ id: "order_1", tableId: "table_1", orderNumber: 5, total: D("200") }]);

      const result = await service.list("org_1");

      expect(result).toEqual([
        { id: "table_1", name: "T1", openOrder: { id: "order_1", tableId: "table_1", orderNumber: 5, total: D("200") } },
        { id: "table_2", name: "T2", openOrder: null },
      ]);
    });

    it("update() 404s for a table from another organization", async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(service.update("org_1", "table_from_org_2", { name: "New" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("public QR ordering", () => {
    it("getPublicMenu() 404s for an unknown qrToken", async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(service.getPublicMenu("bad-token")).rejects.toThrow(NotFoundException);
    });

    it("getPublicMenu() 404s for a deactivated table", async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: "table_1", isActive: false, outlet: { isActive: true } });
      await expect(service.getPublicMenu("token_1")).rejects.toThrow(NotFoundException);
    });

    it("getPublicMenu() returns a de-duplicated, active-only list of sellable items", async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({
        id: "table_1",
        organizationId: "org_1",
        outletId: "outlet_1",
        name: "T1",
        isActive: true,
        outlet: { id: "outlet_1", name: "Main", brandId: "brand_1", isActive: true, brand: { name: "Pizza Co" } },
      });
      const variant = (id: string, active = true) => ({
        id,
        name: "Regular",
        basePrice: D("199"),
        isActive: active,
        product: { name: "Pizza", isActive: true },
      });
      prisma.menu.findMany.mockResolvedValue([
        { items: [{ isAvailable: true, variant: variant("v1") }] },
        // Same variant appears on a second menu assigned to the same outlet — must not be duplicated.
        { items: [{ isAvailable: true, variant: variant("v1") }, { isAvailable: true, variant: variant("v2", false) }] },
      ]);

      const result = await service.getPublicMenu("token_1");

      expect(result.items).toEqual([{ variantId: "v1", productName: "Pizza", variantName: "Regular", price: D("199") }]);
      expect(result.outletName).toBe("Main");
      expect(result.brandName).toBe("Pizza Co");
    });

    it("placeOrder() opens a new order with no staff user when the table has no open order yet", async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({
        id: "table_1",
        organizationId: "org_1",
        outletId: "outlet_1",
        isActive: true,
        outlet: { isActive: true },
      });
      prisma.order.findFirst.mockResolvedValue(null);
      orders.create.mockResolvedValue({ id: "order_1" });
      orders.findOne.mockResolvedValue({ id: "order_1", status: "OPEN" });

      await service.placeOrder("token_1", { items: [{ variantId: "v1", quantity: 2 }] });

      expect(orders.create).toHaveBeenCalledWith("org_1", undefined, { outletId: "outlet_1", channel: "DINE_IN" }, undefined, "table_1");
      expect(orders.addItem).toHaveBeenCalledWith("org_1", "order_1", { variantId: "v1", quantity: 2 });
    });

    it("placeOrder() adds to the table's already-open order instead of starting a second one", async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({
        id: "table_1",
        organizationId: "org_1",
        outletId: "outlet_1",
        isActive: true,
        outlet: { isActive: true },
      });
      prisma.order.findFirst.mockResolvedValue({ id: "order_existing" });
      orders.findOne.mockResolvedValue({ id: "order_existing", status: "OPEN" });

      await service.placeOrder("token_1", { items: [{ variantId: "v1", quantity: 1 }] });

      expect(orders.create).not.toHaveBeenCalled();
      expect(orders.addItem).toHaveBeenCalledWith("org_1", "order_existing", { variantId: "v1", quantity: 1 });
    });
  });
});
