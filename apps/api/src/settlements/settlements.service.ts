import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaService } from "@kitchenos/database";
import { summarise, type CreateSettlementDto, type SettlementRow } from "@kitchenos/shared";
import type { Env } from "../config/env.schema.js";
import { PlanService } from "../plan/plan.service.js";

const D = (n: number) => new Prisma.Decimal(n.toFixed(2));

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Same offset the reports use, so a settlement day and a sales day mean the
   *  same thing when the two are put side by side. */
  private localDayKey(at: Date): string {
    const offsetMinutes = this.config.get("REPORT_UTC_OFFSET_MINUTES", { infer: true });
    return new Date(at.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
  }

  async create(organizationId: string, userId: string | null, dto: CreateSettlementDto) {
    await this.plans.assertFeature(organizationId, "aggregator_reconciliation");

    const rows: SettlementRow[] = dto.rows.map((r) => ({
      externalOrderId: r.externalOrderId,
      orderedAt: r.orderedAt ? new Date(r.orderedAt).toISOString() : null,
      grossSales: r.grossSales,
      restaurantDiscount: r.restaurantDiscount,
      commission: r.commission,
      platformFees: r.platformFees,
      taxesWithheld: r.taxesWithheld,
      otherAdjustments: r.otherAdjustments,
      reportedNetPayout: r.reportedNetPayout ?? null,
    }));
    const totals = summarise(rows);

    const dates = dto.rows
      .map((r) => (r.orderedAt ? new Date(r.orderedAt) : null))
      .filter((d): d is Date => d !== null && Number.isFinite(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    return this.prisma.aggregatorSettlement.create({
      data: {
        organizationId,
        outletId: dto.outletId ?? null,
        platform: dto.platform,
        fileName: dto.fileName,
        periodStart: dates[0] ?? null,
        periodEnd: dates[dates.length - 1] ?? null,
        orderCount: totals.orderCount,
        grossSales: D(totals.grossSales),
        restaurantDiscount: D(totals.restaurantDiscount),
        commission: D(totals.commission),
        platformFees: D(totals.platformFees),
        taxesWithheld: D(totals.taxesWithheld),
        otherAdjustments: D(totals.otherAdjustments),
        calculatedNetPayout: D(totals.calculatedNetPayout),
        reportedNetPayout: totals.reportedNetPayout === null ? null : D(totals.reportedNetPayout),
        uploadedByUserId: userId,
        rows: {
          createMany: {
            data: dto.rows.map((r) => ({
              organizationId,
              externalOrderId: r.externalOrderId,
              orderedAt: r.orderedAt ?? null,
              grossSales: D(r.grossSales),
              restaurantDiscount: D(Math.abs(r.restaurantDiscount)),
              commission: D(Math.abs(r.commission)),
              platformFees: D(Math.abs(r.platformFees)),
              taxesWithheld: D(Math.abs(r.taxesWithheld)),
              otherAdjustments: D(r.otherAdjustments),
              reportedNetPayout: r.reportedNetPayout === null || r.reportedNetPayout === undefined
                ? null
                : D(r.reportedNetPayout),
            })),
          },
        },
      },
    });
  }

  async list(organizationId: string) {
    return this.prisma.aggregatorSettlement.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { outlet: { select: { name: true } } },
    });
  }

  async remove(organizationId: string, id: string) {
    const found = await this.prisma.aggregatorSettlement.findFirst({ where: { id, organizationId } });
    if (!found) throw new NotFoundException("Settlement not found");
    await this.prisma.aggregatorSettlement.delete({ where: { id } });
    return { id };
  }

  /**
   * The settlement beside the POS's own delivery orders for the same days.
   *
   * Matching order by order is not possible yet: an order taken on Zomato does
   * not carry its Zomato id into this POS, because no aggregator integration
   * writes it. So the comparison is by day and by total, which already answers
   * the question that matters — were we paid for everything we cooked.
   */
  async reconcile(organizationId: string, id: string) {
    const settlement = await this.prisma.aggregatorSettlement.findFirst({
      where: { id, organizationId },
      include: { rows: { orderBy: { orderedAt: "asc" } }, outlet: { select: { name: true } } },
    });
    if (!settlement) throw new NotFoundException("Settlement not found");

    if (!settlement.periodStart || !settlement.periodEnd) {
      return { settlement, comparison: null, reason: "Report me order ki date nahi mili" };
    }

    // The period runs to the end of its last day, since a row's date is a day,
    // not a moment: ending at midnight would drop that whole day's orders.
    const until = new Date(settlement.periodEnd);
    until.setUTCHours(23, 59, 59, 999);

    const posOrders = await this.prisma.order.findMany({
      where: {
        organizationId,
        status: "PAID",
        channel: "DELIVERY",
        ...(settlement.outletId ? { outletId: settlement.outletId } : {}),
        closedAt: { gte: settlement.periodStart, lte: until },
      },
      select: { total: true, closedAt: true },
    });

    const posByDay = new Map<string, { orders: number; total: number }>();
    for (const order of posOrders) {
      const key = this.localDayKey(order.closedAt!);
      const entry = posByDay.get(key) ?? { orders: 0, total: 0 };
      entry.orders += 1;
      entry.total += Number(order.total);
      posByDay.set(key, entry);
    }

    const reportByDay = new Map<string, { orders: number; total: number }>();
    for (const row of settlement.rows) {
      if (!row.orderedAt) continue;
      const key = this.localDayKey(row.orderedAt);
      const entry = reportByDay.get(key) ?? { orders: 0, total: 0 };
      entry.orders += 1;
      entry.total += Number(row.grossSales);
      reportByDay.set(key, entry);
    }

    const days = [...new Set([...posByDay.keys(), ...reportByDay.keys()])].sort();
    const byDay = days.map((day) => {
      const pos = posByDay.get(day) ?? { orders: 0, total: 0 };
      const report = reportByDay.get(day) ?? { orders: 0, total: 0 };
      return {
        day,
        posOrders: pos.orders,
        posTotal: Math.round(pos.total * 100) / 100,
        reportOrders: report.orders,
        reportTotal: Math.round(report.total * 100) / 100,
        orderDifference: pos.orders - report.orders,
        totalDifference: Math.round((pos.total - report.total) * 100) / 100,
      };
    });

    const posTotal = posOrders.reduce((s, o) => s + Number(o.total), 0);
    const reportTotal = settlement.rows.reduce((s, r) => s + Number(r.grossSales), 0);

    return {
      settlement,
      comparison: {
        posOrderCount: posOrders.length,
        posTotal: Math.round(posTotal * 100) / 100,
        reportOrderCount: settlement.rows.length,
        reportTotal: Math.round(reportTotal * 100) / 100,
        orderDifference: posOrders.length - settlement.rows.length,
        totalDifference: Math.round((posTotal - reportTotal) * 100) / 100,
        byDay,
      },
      reason: null,
    };
  }
}
