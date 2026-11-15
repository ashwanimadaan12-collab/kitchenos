import { randomUUID, createHash } from "node:crypto";
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService, type User } from "@kitchenos/database";
import { PERMISSIONS, type AuthTokens, type SessionMembership, type SessionUser, type SignupDto } from "@kitchenos/shared";
import type { Env } from "../config/env.schema.js";
import { ms } from "./ms.util.js";
import { slugify } from "../common/utils/slugify.util.js";

const BCRYPT_ROUNDS = 12;

interface IssueContext {
  ip?: string;
  /** Refresh-token family being rotated, or a new one for a fresh login. */
  family?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        "This account is temporarily locked after too many failed attempts. Try again later.",
      );
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      await this.registerFailedLogin(user);
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }
    return user;
  }

  /** Locks the account for a cooldown once failures cross the configured threshold. */
  private async registerFailedLogin(user: User): Promise<void> {
    const maxAttempts = this.config.get("LOGIN_LOCKOUT_MAX_ATTEMPTS", { infer: true });
    const lockoutMinutes = this.config.get("LOGIN_LOCKOUT_MINUTES", { infer: true });
    const attempts = user.failedLoginAttempts + 1;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= maxAttempts ? new Date(Date.now() + lockoutMinutes * 60_000) : undefined,
      },
    });
  }

  async login(email: string, password: string, ctx: IssueContext = {}): Promise<AuthTokens> {
    const user = await this.validateCredentials(email, password);
    return this.issueTokens(user.id, user.email, { ...ctx, family: randomUUID() });
  }

  /**
   * Self-service signup for a brand-new restaurant: creates an empty organization (no demo
   * brands/outlets/menu — this person builds all of that through the normal admin screens
   * afterwards) with this person as its one-person "Org Admin" role, then logs them straight in.
   * Grants every permission except `platform:manage` — that one is reserved for KitchenOS's own
   * platform operators, never for a customer's own admin. Pulled from the Permission table rather
   * than a hardcoded list (like the demo seed's own `ORG_ADMIN_PERMISSIONS`) so it never drifts
   * out of sync as new features add permissions — this does mean the one-time permission seed
   * (`prisma/seed.ts`'s `PERMISSIONS.createMany`, or a production-only equivalent that skips the
   * demo organization) must have already run before the first signup.
   */
  async signup(dto: SignupDto, ctx: IssueContext = {}): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("An account with this email already exists.");

    const baseSlug = slugify(dto.organizationName) || "organization";
    let slug = baseSlug;
    for (let suffix = 1; await this.prisma.organization.findUnique({ where: { slug } }); suffix++) {
      slug = `${baseSlug}-${suffix}`;
    }

    const passwordHash = bcrypt.hashSync(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.organizationName, slug } });
      const role = await tx.role.create({
        data: { organizationId: organization.id, name: "Org Admin", description: "Full access within the organization" },
      });
      const permissions = await tx.permission.findMany({ where: { key: { not: PERMISSIONS.PLATFORM_MANAGE } } });
      if (permissions.length === 0) {
        // The permission catalogue is seeded once, globally, independently of any organization —
        // if it's empty, this deployment was never seeded at all, which is a setup error, not
        // something a signing-up customer did wrong.
        throw new ConflictException("This deployment hasn't been initialized yet — run the database seed first.");
      }
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
      const createdUser = await tx.user.create({
        data: { email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName },
      });
      await tx.organizationMembership.create({
        data: { organizationId: organization.id, userId: createdUser.id, roleId: role.id },
      });
      return createdUser;
    });

    return this.issueTokens(user.id, user.email, { ...ctx, family: randomUUID() });
  }

  /**
   * Rotates a refresh token: the presented token is revoked and replaced by
   * a brand-new one in the same family. If a token is presented that was
   * already revoked (replacedBy is set), the whole family is revoked —
   * that only happens if a stolen/leaked token was reused.
   */
  async refresh(presentedToken: string, ctx: IssueContext = {}): Promise<AuthTokens> {
    const tokenHash = this.hashToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token has been revoked. Please log in again.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is no longer active.");
    }

    // Atomic claim: if two requests race to rotate the same token, only the one whose
    // conditional update actually flips revokedAt (count === 1) may issue new tokens —
    // the loser sees count === 0 and is treated as reuse of an already-rotated token,
    // which revokes the whole family just like the explicit reuse-detection branch above.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token has been revoked. Please log in again.");
    }

    return this.issueTokens(user.id, user.email, { ...ctx, family: stored.family }, stored.id);
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.hashToken(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) return;

    await this.prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * One row per refresh-token family that's still active represents one logged-in "session" (a
   * family is rotated on every refresh, so its latest un-rotated token is the one that matters).
   * There's no way to mark which one is "this" session from an access-token-only request, since
   * the access token carries no family claim — the caller sees every active session as a peer.
   */
  async listSessions(userId: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const latestByFamily = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!latestByFamily.has(token.family)) latestByFamily.set(token.family, token);
    }
    return [...latestByFamily.values()].map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      createdByIp: t.createdByIp,
    }));
  }

  /** Revokes a whole session (its token family), e.g. to sign out a lost or stolen device remotely. */
  async revokeSession(userId: string, tokenId: string): Promise<void> {
    const token = await this.prisma.refreshToken.findFirst({ where: { id: tokenId, userId } });
    if (!token) throw new NotFoundException("Session not found");

    await this.prisma.refreshToken.updateMany({
      where: { family: token.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            organization: true,
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    const memberships: SessionMembership[] = user.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      roleId: m.roleId,
      roleName: m.role.name,
      permissions: m.role.permissions.map((rp) => rp.permission.key),
    }));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      memberships,
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    ctx: IssueContext,
    replacesId?: string,
  ): Promise<AuthTokens> {
    const accessTtl = this.config.get("JWT_ACCESS_TTL", { infer: true });
    const refreshTtl = this.config.get("JWT_REFRESH_TTL", { infer: true });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }), expiresIn: accessTtl },
    );

    const refreshToken = randomUUID() + randomUUID();
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + ms(refreshTtl));

    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        family: ctx.family ?? randomUUID(),
        expiresAt,
        createdByIp: ctx.ip,
      },
    });

    if (replacesId) {
      await this.prisma.refreshToken.update({
        where: { id: replacesId },
        data: { replacedBy: created.id },
      });
    }

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + ms(accessTtl)).toISOString(),
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
