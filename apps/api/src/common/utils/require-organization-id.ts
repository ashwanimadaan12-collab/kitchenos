import { BadRequestException } from "@nestjs/common";
import type { RequestUser } from "../types/authenticated-request.js";

/**
 * Every org-scoped route requires the X-Organization-Id header. In practice
 * PermissionsGuard already rejects the request (no permissions resolve
 * without an active org), but this gives services a typed, non-null id and
 * fails loudly if a route is ever misconfigured as @Public() by mistake.
 */
export function requireOrganizationId(user: RequestUser): string {
  if (!user.organizationId) {
    throw new BadRequestException("An active organization (X-Organization-Id) is required");
  }
  return user.organizationId;
}
