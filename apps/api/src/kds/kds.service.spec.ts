import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { KdsService } from "./kds.service.js";
import { KdsGateway } from "./kds.gateway.js";

describe("KdsService", () => {
  let service: KdsService;
  let gateway: { broadcast: jest.Mock };
  let prisma: {
    recipe: { findFirst: jest.Mock };
    kitchenTicketItem: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    kitchenStation: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      recipe: { findFirst: jest.fn() },
      kitchenTicketItem: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      kitchenStation: { findFirst: jest.fn() },
    };
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
    prisma.kitchenTicketItem.update.mockResolvedValue({ id: "ticket_1", status: "IN_PROGRESS", stationId: "station_1" });

    const result = await service.advanceStatus("org_1", "ticket_1", { status: "IN_PROGRESS" });

    expect(result).toEqual({ id: "ticket_1", status: "IN_PROGRESS", stationId: "station_1" });
    expect(prisma.kitchenTicketItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket_1" },
        data: expect.objectContaining({ status: "IN_PROGRESS", startedAt: expect.any(Date) }),
      }),
    );
    expect(gateway.broadcast).toHaveBeenCalledWith("org_1", "station_1", "ticket.updated", {
      id: "ticket_1",
      status: "IN_PROGRESS",
      stationId: "station_1",
    });
  });
});
