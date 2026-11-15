import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Env } from "../config/env.schema.js";
import type { RequestUser } from "../common/types/authenticated-request.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, "jwt-access") {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_ACCESS_SECRET", { infer: true }),
      passReqToCallback: true,
    });
  }

  /**
   * The X-Organization-Id header picks which membership's permissions apply
   * to this request; the frontend's org selector sends it on every call.
   * Permission resolution itself happens in AuthService.resolvePermissions,
   * not here, so it always reflects the current DB state, not a stale token.
   */
  async validate(
    req: { headers: Record<string, string | string[] | undefined> },
    payload: AccessTokenPayload,
  ): Promise<RequestUser> {
    const organizationId = (req.headers["x-organization-id"] as string | undefined) ?? null;
    return { userId: payload.sub, email: payload.email, organizationId, permissions: [] };
  }
}
