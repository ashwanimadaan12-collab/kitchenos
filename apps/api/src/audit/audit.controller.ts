import { Controller, Get, Query } from "@nestjs/common";
import { PERMISSIONS } from "@kitchenos/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/permissions.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { requireOrganizationId } from "../common/utils/require-organization-id.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuditService } from "./audit.service.js";
import { auditLogFilterSchema, type AuditLogFilterDto } from "./dto/audit-log-filter.dto.js";

@Controller({ path: "audit-logs", version: "1" })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  async list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(auditLogFilterSchema)) filters: AuditLogFilterDto,
  ) {
    return this.audit.list(requireOrganizationId(user), filters);
  }
}
