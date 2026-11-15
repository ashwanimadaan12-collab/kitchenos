import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@kitchenos/database";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import type { CreateExpenseDto } from "./dto/create-expense.dto.js";
import type { UpdateExpenseDto } from "./dto/update-expense.dto.js";

const EXPENSE_INCLUDE = {
  outlet: true,
  recordedBy: { select: { id: true, firstName: true, lastName: true } },
};

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, outletId?: string) {
    return this.prisma.expense.findMany({
      where: { organizationId, ...(outletId ? { outletId } : {}) },
      orderBy: { incurredAt: "desc" },
      include: EXPENSE_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId }, include: EXPENSE_INCLUDE });
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }

  async create(organizationId: string, userId: string, dto: CreateExpenseDto) {
    if (dto.outletId) await this.assertOutletBelongsToOrg(organizationId, dto.outletId);

    return this.prisma.expense.create({
      data: {
        organizationId,
        outletId: dto.outletId,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        incurredAt: dto.incurredAt,
        recordedByUserId: userId,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async update(organizationId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOne(organizationId, id);
    if (dto.outletId) await this.assertOutletBelongsToOrg(organizationId, dto.outletId);

    return this.prisma.expense.update({
      where: { id },
      data: {
        outletId: dto.outletId,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        incurredAt: dto.incurredAt,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  private async assertOutletBelongsToOrg(organizationId: string, outletId: string) {
    await assertBelongsToOrg(
      () => this.prisma.outlet.findFirst({ where: { id: outletId, organizationId } }),
      "Outlet",
    );
  }
}
