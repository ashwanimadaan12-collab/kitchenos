import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../common/decorators/public.decorator.js";
import type { AuthenticatedRequest } from "../common/types/authenticated-request.js";
import { PermissionsResolverService } from "./permissions-resolver.service.js";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-access") {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsResolver: PermissionsResolverService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user.permissions = await this.permissionsResolver.resolve(
      request.user.userId,
      request.user.organizationId,
    );

    return true;
  }
}
