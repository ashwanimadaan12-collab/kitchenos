import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { LoyaltyService } from "./loyalty.service.js";
import {
  manualLoyaltyAdjustmentSchema,
  type ManualLoyaltyAdjustmentDto,
} from "./dto/manual-loyalty-adjustment.dto.js";
import {
  loyaltyTransactionFilterSchema,
  type LoyaltyTransactionFilterDto,
} from "./dto/loyalty-transaction-filter.dto.js";

@Controller({ path: "customers/:customerId/loyalty", version: "1" })
export class CustomerLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService,
  ) {}

  @Get("wallet")
  @RequirePermissions(PERMISSIONS.LOYALTY_VIEW)
  async getWallet(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.loyalty.getWallet(requireOrganizationId(user), customerId);
  }

  @Get("transactions")
  @RequirePermissions(PERMISSIONS.LOYALTY_VIEW)
  async listTransactions(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Query(new ZodValidationPipe(loyaltyTransactionFilterSchema)) filters: LoyaltyTransactionFilterDto,
  ) {
    return this.loyalty.listTransactions(requireOrganizationId(user), customerId, filters);
  }

  @Post("adjustments")
  @RequirePermissions(PERMISSIONS.LOYALTY_MANAGE)
  async recordAdjustment(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Body(new ZodValidationPipe(manualLoyaltyAdjustmentSchema)) dto: ManualLoyaltyAdjustmentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const transaction = await this.loyalty.recordManualAdjustment(organizationId, customerId, dto, user.userId);
    await this.audit.log({
      action: "loyalty_transaction.manual_adjustment",
      entityType: "Customer",
      entityId: customerId,
      organizationId,
      userId: user.userId,
      metadata: { points: dto.points, note: dto.note },
    });
    return transaction;
  }
}
