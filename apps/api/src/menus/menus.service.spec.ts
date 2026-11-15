import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { MenusService } from "./menus.service.js";

describe("MenusService", () => {
  let service: MenusService;
  let prisma: {
    menu: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    brand: { findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock };
    menuItem: { create: jest.Mock; deleteMany: jest.Mock };
    outlet: { findFirst: jest.Mock };
    outletMenu: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      menu: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      menuItem: { create: jest.fn(), deleteMany: jest.fn() },
      outlet: { findFirst: jest.fn() },
      outletMenu: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [MenusService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MenusService);
  });

  it("refuses to create a menu for a brand belonging to another organization", async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await expect(service.create("org_1", { brandId: "brand_from_org_2", name: "Dine-in" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it("findOne() 404s instead of leaking a menu from another organization", async () => {
    prisma.menu.findFirst.mockResolvedValue(null);
    await expect(service.findOne("org_1", "menu_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("refuses to add a variant from a different brand than the menu's own", async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: "menu_1", organizationId: "org_1", brandId: "brand_1" });
    prisma.productVariant.findFirst.mockResolvedValue(null); // scoped lookup by brandId finds nothing

    await expect(service.addItem("org_1", "menu_1", { variantId: "variant_other_brand" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.productVariant.findFirst).toHaveBeenCalledWith({
      where: { id: "variant_other_brand", product: { organizationId: "org_1", brandId: "brand_1" } },
    });
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  it("refuses to assign a menu to an outlet of a different brand", async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: "menu_1", organizationId: "org_1", brandId: "brand_1" });
    prisma.outlet.findFirst.mockResolvedValue(null); // scoped lookup by brandId finds nothing

    await expect(service.assignToOutlet("org_1", "menu_1", { outletId: "outlet_other_brand" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.outletMenu.upsert).not.toHaveBeenCalled();
  });

  it("assigns a menu to an outlet of the same brand", async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: "menu_1", organizationId: "org_1", brandId: "brand_1" });
    prisma.outlet.findFirst.mockResolvedValue({ id: "outlet_1", brandId: "brand_1" });
    prisma.outletMenu.upsert.mockResolvedValue({ id: "om_1" });

    const result = await service.assignToOutlet("org_1", "menu_1", { outletId: "outlet_1", channel: "DELIVERY" });

    expect(result).toEqual({ id: "om_1" });
    expect(prisma.outletMenu.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { outletId_menuId: { outletId: "outlet_1", menuId: "menu_1" } } }),
    );
  });
});
