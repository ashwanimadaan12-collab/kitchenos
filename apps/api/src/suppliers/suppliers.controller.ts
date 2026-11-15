import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { SuppliersService } from "./suppliers.service.js";
import { createSupplierSchema, type CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { updateSupplierSchema, type UpdateSupplierDto } from "./dto/update-supplier.dto.js";

@Controller({ path: "suppliers", version: "1" })
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIER_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.suppliers.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIER_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.suppliers.findOne(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIER_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const supplier = await this.suppliers.create(organizationId, dto);
    await this.audit.log({
      action: "supplier.create",
      entityType: "Supplier",
      entityId: supplier.id,
      organizationId,
      userId: user.userId,
      metadata: { name: supplier.name },
    });
    return supplier;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIER_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) dto: UpdateSupplierDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const supplier = await this.suppliers.update(organizationId, id, dto);
    await this.audit.log({
      action: "supplier.update",
      entityType: "Supplier",
      entityId: supplier.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return supplier;
  }
}
