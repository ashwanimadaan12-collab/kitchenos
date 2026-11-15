import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { AuthTokens, SessionUser } from "@kitchenos/shared";
import { Public } from "../common/decorators/public.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AuditService } from "../audit/audit.service.js";
import type { RequestUser } from "../common/types/authenticated-request.js";
import { AuthService } from "./auth.service.js";
import { loginSchema, type LoginDto } from "./dto/login.dto.js";
import { refreshSchema, type RefreshDto } from "./dto/refresh.dto.js";
import { signupSchema, type SignupDto } from "./dto/signup.dto.js";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  // Tighter than the global rate limit: credential-stuffing/brute-force protection on top of
  // the account-lockout check inside AuthService itself.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokens> {
    const tokens = await this.authService.login(dto.email, dto.password, { ip: req.ip });
    await this.audit.log({ action: "auth.login", entityType: "User", metadata: { email: dto.email } });
    return tokens;
  }

  @Public()
  // Same brute-force-style protection as login, mainly to keep this from being used to spam the
  // deployment with junk organizations rather than credential guessing.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("signup")
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) dto: SignupDto,
    @Req() req: Request,
  ): Promise<AuthTokens> {
    const tokens = await this.authService.signup(dto, { ip: req.ip });
    await this.audit.log({
      action: "auth.signup",
      entityType: "Organization",
      metadata: { organizationName: dto.organizationName, email: dto.email },
    });
    return tokens;
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @Req() req: Request,
  ): Promise<AuthTokens> {
    return this.authService.refresh(dto.refreshToken, { ip: req.ip });
  }

  @Post("logout")
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ success: true }> {
    await this.authService.logout(dto.refreshToken);
    await this.audit.log({ action: "auth.logout", entityType: "User", userId: user.userId });
    return { success: true };
  }

  @Get("me")
  async me(@CurrentUser() user: RequestUser): Promise<SessionUser> {
    return this.authService.getSessionUser(user.userId);
  }

  @Get("sessions")
  async listSessions(@CurrentUser() user: RequestUser) {
    return this.authService.listSessions(user.userId);
  }

  @Delete("sessions/:id")
  async revokeSession(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    await this.authService.revokeSession(user.userId, id);
    await this.audit.log({ action: "auth.session.revoke", entityType: "RefreshToken", entityId: id, userId: user.userId });
    return { success: true } as const;
  }
}
