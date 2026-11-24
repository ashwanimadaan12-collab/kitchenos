import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { PERMISSIONS, createSettlementSchema, type CreateSettlementDto } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { SettlementsService } from "./settlements.service.js";

@Controller({ path: "settlements", version: "1" })
@RequirePermissions(PERMISSIONS.REPORT_VIEW)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.settlements.list(requireOrganizationId(user));
  }

  @Get(":id")
  async reconcile(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.settlements.reconcile(requireOrganizationId(user), id);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSettlementSchema)) dto: CreateSettlementDto,
  ) {
    return this.settlements.create(requireOrganizationId(user), user.userId, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.settlements.remove(requireOrganizationId(user), id);
  }
}
