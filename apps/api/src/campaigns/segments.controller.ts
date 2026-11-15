import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "../audit/audit.service.js";
import { SegmentsService } from "./segments.service.js";
import { createCustomerSegmentSchema, type CreateCustomerSegmentDto } from "./dto/create-customer-segment.dto.js";
import { updateCustomerSegmentSchema, type UpdateCustomerSegmentDto } from "./dto/update-customer-segment.dto.js";

@Controller({ path: "customer-segments", version: "1" })
export class SegmentsController {
  constructor(
    private readonly segments: SegmentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async list(@CurrentUser() user: RequestUser) {
    return this.segments.list(requireOrganizationId(user));
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async findOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.segments.findOne(requireOrganizationId(user), id);
  }

  @Get(":id/customers")
  @RequirePermissions(PERMISSIONS.CAMPAIGN_VIEW)
  async previewCustomers(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const organizationId = requireOrganizationId(user);
    const segment = await this.segments.findOne(organizationId, id);
    const customerIds = await this.segments.resolveCustomerIds(organizationId, segment);
    return { count: customerIds.length, customerIds };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CAMPAIGN_MANAGE)
  async create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCustomerSegmentSchema)) dto: CreateCustomerSegmentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const segment = await this.segments.create(organizationId, dto);
    await this.audit.log({
      action: "customer_segment.create",
      entityType: "CustomerSegment",
      entityId: segment.id,
      organizationId,
      userId: user.userId,
      metadata: { name: dto.name, type: dto.type },
    });
    return segment;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CAMPAIGN_MANAGE)
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSegmentSchema)) dto: UpdateCustomerSegmentDto,
  ) {
    const organizationId = requireOrganizationId(user);
    const segment = await this.segments.update(organizationId, id, dto);
    await this.audit.log({
      action: "customer_segment.update",
      entityType: "CustomerSegment",
      entityId: segment.id,
      organizationId,
      userId: user.userId,
    });
    return segment;
  }
}
