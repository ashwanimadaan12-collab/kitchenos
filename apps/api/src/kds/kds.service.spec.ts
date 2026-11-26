import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { KdsService } from "./kds.service.js";
import { KdsGateway } from "./kds.gateway.js";

/** What advanceStatus's own `include` really returns — the order id is what the sync needs. */
const TICKET_IN_PROGRESS = {
  id: "ticket_1",
  status: "IN_PROGRESS",
  stationId: "station_1",
  orderItem: { orderId: "order_1" },
};

describe("KdsService", () => {
  let service: KdsService;
  let gateway: { broadcast: jest.Mock };
  let prisma: {
    recipe: { findFirst: jest.Mock };
    kitchenTicketItem: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    kitchenStation: { findFirst: jest.Mock };
    order: { findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      recipe: { findFirst: jest.fn() },
      kitchenTicketItem: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      kitchenStation: { findFirst: jest.fn() },
      order: { findFirst: jest.fn(), update: jest.fn() },
    };
    // Advancing a ticket now also syncs the order's fulfillment stage. Default to "this order
    // has no live tickets", so the tests that only care about the ticket itself stay unaffected.
    prisma.kitchenTicketItem.findMany.mockResolvedValue([]);
    gateway = { broadcast: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [KdsService, { provide: PrismaService, useValue: prisma }, { provide: KdsGateway, useValue: gateway }],
    }).compile();
    service = module.get(KdsService);
  });

  it("createTicketForOrderItem() is a no-op when the variant has no recipe", async () => {
    prisma.recipe.findFirst.mockResolvedValue(null);
    const result = await service.createTicketForOrderItem("org_1", "item_1", "variant_1");
    expect(result).toBeNull();
    expect(prisma.kitchenTicketItem.create).not.toHaveBeenCalled();
  });

  it("createTicketForOrderItem() is a no-op when the recipe has no preparation station", async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", preparationStationId: null });
    const result = await service.createTicketForOrderItem("org_1", "item_1", "variant_1");
    expect(result).toBeNull();
    expect(prisma.kitchenTicketItem.create).not.toHaveBeenCalled();
  });

  it("createTicketForOrderItem() routes to the recipe's preparation station and broadcasts it", async () => {
    prisma.recipe.findFirst.mockResolvedValue({ id: "recipe_1", preparationStationId: "station_1" });
    prisma.kitchenTicketItem.create.mockResolvedValue({ id: "ticket_1", stationId: "station_1" });

    const result = await service.createTicketForOrderItem("org_1", "item_1", "variant_1");

    expect(result).toEqual({ id: "ticket_1", stationId: "station_1" });
    expect(prisma.kitchenTicketItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { organizationId: "org_1", orderItemId: "item_1", stationId: "station_1" } }),
    );
    expect(gateway.broadcast).toHaveBeenCalledWith("org_1", "station_1", "ticket.created", { id: "ticket_1", stationId: "station_1" });
  });

  it("cancelTicketForOrderItem() is a no-op when no ticket exists", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue(null);
    await service.cancelTicketForOrderItem("org_1", "item_1");
    expect(prisma.kitchenTicketItem.update).not.toHaveBeenCalled();
  });

  it("cancelTicketForOrderItem() never cancels an already-served ticket", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "SERVED" });
    await service.cancelTicketForOrderItem("org_1", "item_1");
    expect(prisma.kitchenTicketItem.update).not.toHaveBeenCalled();
  });

  it("cancelTicketForOrderItem() cancels a queued ticket and broadcasts it", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "QUEUED", stationId: "station_1" });
    prisma.kitchenTicketItem.update.mockResolvedValue({ id: "ticket_1", status: "CANCELLED", stationId: "station_1" });

    await service.cancelTicketForOrderItem("org_1", "item_1");

    expect(prisma.kitchenTicketItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ticket_1" }, data: { status: "CANCELLED" } }),
    );
    expect(gateway.broadcast).toHaveBeenCalledWith("org_1", "station_1", "ticket.cancelled", {
      id: "ticket_1",
      status: "CANCELLED",
      stationId: "station_1",
    });
  });

  it("listForStation() 404s for a station from another organization", async () => {
    prisma.kitchenStation.findFirst.mockResolvedValue(null);
    await expect(service.listForStation("org_1", "station_from_org_2")).rejects.toThrow(NotFoundException);
  });

  it("advanceStatus() 404s for a ticket from another organization", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue(null);
    await expect(service.advanceStatus("org_1", "ticket_from_org_2", { status: "READY" })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("advanceStatus() refuses to move a ticket backward or sideways", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "READY" });
    await expect(service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.kitchenTicketItem.update).not.toHaveBeenCalled();
  });

  it("advanceStatus() refuses to act on an already-served ticket", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "SERVED" });
    await expect(service.advanceStatus("org_1", "ticket_1", { status: "READY" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("advanceStatus() moves a queued ticket forward, stamps the timestamp, and broadcasts it", async () => {
    prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "QUEUED" });
    prisma.kitchenTicketItem.update.mockResolvedValue(TICKET_IN_PROGRESS);

    const result = await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

    expect(result).toEqual(TICKET_IN_PROGRESS);
    expect(prisma.kitchenTicketItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket_1" },
        data: expect.objectContaining({ status: "IN_PROGRESS", startedAt: expect.any(Date) }),
      }),
    );
    expect(gateway.broadcast).toHaveBeenCalledWith("org_1", "station_1", "ticket.updated", TICKET_IN_PROGRESS);
  });

  describe("order fulfillment sync", () => {
    beforeEach(() => {
      prisma.kitchenTicketItem.findFirst.mockResolvedValue({ id: "ticket_1", status: "QUEUED" });
      prisma.kitchenTicketItem.update.mockResolvedValue(TICKET_IN_PROGRESS);
      prisma.order.findFirst.mockResolvedValue({ id: "order_1", status: "OPEN", fulfillment: "PLACED" });
    });

    it("moves the order to COOKING as soon as one station starts", async () => {
      prisma.kitchenTicketItem.findMany.mockResolvedValue([{ status: "IN_PROGRESS" }, { status: "QUEUED" }]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order_1" },
        data: { fulfillment: "COOKING", cookingStartedAt: expect.any(Date) },
      });
    });

    it("holds the order at COOKING while any station is still working", async () => {
      prisma.order.findFirst.mockResolvedValue({ id: "order_1", status: "OPEN", fulfillment: "COOKING" });
      prisma.kitchenTicketItem.findMany.mockResolvedValue([{ status: "READY" }, { status: "IN_PROGRESS" }]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      // Already COOKING, and READY is not reached yet — nothing to write.
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("moves the order to READY only once every live ticket is done", async () => {
      prisma.order.findFirst.mockResolvedValue({ id: "order_1", status: "OPEN", fulfillment: "COOKING" });
      prisma.kitchenTicketItem.findMany.mockResolvedValue([{ status: "READY" }, { status: "SERVED" }]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: "order_1" },
        data: { fulfillment: "READY", readyAt: expect.any(Date) },
      });
    });

    it("never drags a dispatched order back when a station finishes late", async () => {
      prisma.order.findFirst.mockResolvedValue({ id: "order_1", status: "OPEN", fulfillment: "PICKED_UP" });
      prisma.kitchenTicketItem.findMany.mockResolvedValue([{ status: "READY" }]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("leaves a voided order alone", async () => {
      prisma.order.findFirst.mockResolvedValue({ id: "order_1", status: "VOIDED", fulfillment: "PLACED" });
      prisma.kitchenTicketItem.findMany.mockResolvedValue([{ status: "READY" }]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("does nothing for an order whose only tickets were cancelled", async () => {
      prisma.kitchenTicketItem.findMany.mockResolvedValue([]);

      await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

      expect(prisma.order.findFirst).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
