import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { CustomersService } from "./customers.service.js";
import { createCustomerSchema, type CreateCustomerDto } from "./dto/create-customer.dto.js";
import { updateCustomerSchema, type UpdateCustomerDto } from "./dto/update-customer.dto.js";

@Controller({ path: "customers", version: "1" })
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.customers.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMER_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.customers.findOne(requireOrganizationId(user), id);
  }

  @Get(":id/orders")
  @RequirePermissions(PERMISSIONS.CUSTOMER_VIEW)
  async orderHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.customers.orderHistory(requireOrganizationId(user), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const customer = await this.customers.create(organizationId, dto);
    await this.audit.log({
      action: "customer.create",
      entityType: "Customer",
      entityId: customer.id,
      organizationId,
      userId: user.userId,
      metadata: { name: customer.name, phone: customer.phone },
    });
    return customer;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) dto: UpdateCustomerDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const customer = await this.customers.update(organizationId, id, dto);
    await this.audit.log({
      action: "customer.update",
      entityType: "Customer",
      entityId: customer.id,
      organizationId,
      userId: user.userId,
      metadata: dto as Record<string, unknown>,
    });
    return customer;
  }
}
