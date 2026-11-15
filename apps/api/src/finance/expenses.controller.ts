import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { ExpensesService } from "./expenses.service.js";
import { createExpenseSchema, type CreateExpenseDto } from "./dto/create-expense.dto.js";
import { updateExpenseSchema, type UpdateExpenseDto } from "./dto/update-expense.dto.js";

@Controller({ path: "expenses", version: "1" })
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("outletId") outletId?: string) {
    return this.expenses.list(requireOrganizationId(user), outletId);
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.expenses.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) dto: CreateExpenseDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const expense = await this.expenses.create(organizationId, user.userId, dto);
    await this.audit.log({
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      organizationId,
      userId: user.userId,
      metadata: { category: expense.category, amount: expense.amount.toString() },
    });
    return expense;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) dto: UpdateExpenseDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const expense = await this.expenses.update(organizationId, id, dto);
    await this.audit.log({
      action: "expense.update",
      entityType: "Expense",
      entityId: expense.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return expense;
  }
}
