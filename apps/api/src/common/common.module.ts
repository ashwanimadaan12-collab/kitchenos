import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { GlobalExceptionFilter } from "./filters/global-exception.filter.js";

/**
 * Auth/RBAC guards are registered as APP_GUARD in app.module.ts, not here,
 * because guard execution order matters (JwtAuthGuard must run before
 * PermissionsGuard) and NestJS runs APP_GUARD providers in registration order.
 */
@Module({
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class CommonModule {}
