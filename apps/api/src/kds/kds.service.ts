import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import { KdsGateway } from "./kds.gateway.js";
import type { AdvanceTicketStatusDto } from "./dto/advance-ticket-status.dto.js";

const TICKET_INCLUDE = {
  orderItem: { include: { order: { include: { outlet: true } } } },
  station: true,
};

/** Forward-only lifecycle; QUEUED is the initial state and CANCELLED is set only when an item is voided. */
const STATUS_RANK: Record<string, number> = { QUEUED: 0, IN_PROGRESS: 1, READY: 2, SERVED: 3, CANCELLED: 4 };

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: KdsGateway,
  ) {}

  /** Routes a newly added order item to its recipe's preparation station, if it has one. A no-op otherwise. */
  async createTicketForOrderItem(organizationId: string, orderItemId: string, variantId: string) {
    const recipe = await this.prisma.recipe.findFirst({ where: { variantId, organizationId } });
    if (!recipe?.preparationStationId) return null;

    const ticket = await this.prisma.kitchenTicketItem.create({
      data: { organizationId, orderItemId, stationId: recipe.preparationStationId },
      include: TICKET_INCLUDE,
    });
    this.gateway.broadcast(organizationId, ticket.stationId, "ticket.created", ticket);
    return ticket;
  }

  /** Cancels the ticket for a voided order item, if one was ever created. A no-op otherwise. */
  async cancelTicketForOrderItem(organizationId: string, orderItemId: string) {
    const ticket = await this.prisma.kitchenTicketItem.findFirst({ where: { orderItemId, organizationId } });
    if (!ticket || ticket.status === "SERVED") return;
    const cancelled = await this.prisma.kitchenTicketItem.update({
      where: { id: ticket.id },
      data: { status: "CANCELLED" },
      include: TICKET_INCLUDE,
    });
    this.gateway.broadcast(organizationId, cancelled.stationId, "ticket.cancelled", cancelled);
  }

  async listForStation(organizationId: string, stationId: string, statuses?: string[]) {
    await this.assertStationBelongsToOrg(organizationId, stationId);
    type Status = "QUEUED" | "IN_PROGRESS" | "READY" | "SERVED" | "CANCELLED";
    return this.prisma.kitchenTicketItem.findMany({
      where: {
        organizationId,
        stationId,
        status: { in: (statuses?.length ? statuses : ["QUEUED", "IN_PROGRESS", "READY"]) as Status[] },
      },
      orderBy: { queuedAt: "asc" },
      include: TICKET_INCLUDE,
    });
  }

  async advanceStatus(organizationId: string, ticketId: string, dto: AdvanceTicketStatusDto) {
    const ticket = await this.prisma.kitchenTicketItem.findFirst({ where: { id: ticketId, organizationId } });
    if (!ticket) throw new NotFoundException("Kitchen ticket not found");

    const targetRank = STATUS_RANK[dto.status] ?? 0;
    const currentRank = STATUS_RANK[ticket.status] ?? 0;
    if (targetRank <= currentRank) {
      throw new BadRequestException(`Cannot move a ${ticket.status} ticket back to ${dto.status}`);
    }
    if (ticket.status === "CANCELLED" || ticket.status === "SERVED") {
      throw new BadRequestException(`Ticket is already ${ticket.status.toLowerCase()}`);
    }

    const now = new Date();
    const timestamps =
      dto.status === "IN_PROGRESS"
        ? { startedAt: now }
        : dto.status === "READY"
          ? { readyAt: now }
          : { servedAt: now };

    const updated = await this.prisma.kitchenTicketItem.update({
      where: { id: ticketId },
      data: { status: dto.status, ...timestamps },
      include: TICKET_INCLUDE,
    });
    this.gateway.broadcast(organizationId, updated.stationId, "ticket.updated", updated);
    return updated;
  }

  private async assertStationBelongsToOrg(organizationId: string, stationId: string) {
    return assertBelongsToOrg(
      () => this.prisma.kitchenStation.findFirst({ where: { id: stationId, kitchen: { organizationId } } }),
      "Kitchen station",
    );
  }
}
