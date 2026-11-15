import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@kitchenos/shared";

export const PERMISSIONS_KEY = "permissions";

/** Marks a route/controller as requiring ALL of the given permissions in the caller's active org. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
