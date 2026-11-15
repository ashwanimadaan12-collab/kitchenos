import type { Request } from "express";

/** Attached to req.user by JwtAccessStrategy after a valid access token. */
export interface RequestUser {
  userId: string;
  email: string;
  /** Active organization for this request, set via X-Organization-Id header. */
  organizationId: string | null;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
