import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { TablesService } from "./tables.service.js";
import { createTableSchema, type CreateTableDto } from "./dto/create-table.dto.js";
import { updateTableSchema, type UpdateTableDto } from "./dto/update-table.dto.js";

@Controller({ path: "tables", version: "1" })
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TABLE_VIEW)
  async list(@CurrentUser() user: RequestUser, @Query("outletId") outletId?: string) {
    return this.tables.list(requireOrganizationId(user), outletId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TABLE_MANAGE)
  async create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createTableSchema)) dto: CreateTableDto) {
    return this.tables.create(requireOrganizationId(user), dto);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.TABLE_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTableSchema)) dto: UpdateTableDto,
  ) {
    return this.tables.update(requireOrganizationId(user), id, dto);
  }
}
