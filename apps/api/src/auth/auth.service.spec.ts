import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PrismaService } from "@kitchenos/database";
import { TRIAL_DAYS } from "@kitchenos/shared";
import { AuthService } from "./auth.service.js";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock; create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    organization: { findUnique: jest.Mock; create: jest.Mock };
    role: { create: jest.Mock };
    permission: { findMany: jest.Mock };
    rolePermission: { createMany: jest.Mock };
    organizationMembership: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: "rt_new" }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      organization: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      role: { create: jest.fn() },
      permission: { findMany: jest.fn() },
      rolePermission: { createMany: jest.fn() },
      organizationMembership: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue("signed.jwt.token") },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                JWT_ACCESS_TTL: "15m",
                JWT_REFRESH_TTL: "30d",
                JWT_ACCESS_SECRET: "x".repeat(32),
                LOGIN_LOCKOUT_MAX_ATTEMPTS: 5,
                LOGIN_LOCKOUT_MINUTES: 15,
              })[key],
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it("rejects login for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.validateCredentials("nobody@example.com", "whatever123")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  describe("signup", () => {
    const dto = {
      organizationName: "Pizza Planet",
      firstName: "Rex",
      lastName: "Owner",
      email: "rex@pizzaplanet.test",
      password: "password123",
    };

    it("rejects a signup for an email that already has an account", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user_existing" });
      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });

    it("refuses to create an org admin role with no permissions to grant (deployment never seeded)", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: "org_1" });
      prisma.role.create.mockResolvedValue({ id: "role_1" });
      prisma.permission.findMany.mockResolvedValue([]);

      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("creates an empty organization, grants every permission except platform:manage, and logs the new admin straight in", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: "org_1", name: "Pizza Planet", slug: "pizza-planet" });
      prisma.role.create.mockResolvedValue({ id: "role_1" });
      prisma.permission.findMany.mockResolvedValue([
        { id: "perm_1", key: "order:manage" },
        { id: "perm_2", key: "report:view" },
      ]);
      prisma.user.create.mockResolvedValue({ id: "user_1", email: dto.email });

      const tokens = await service.signup(dto);

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: "Pizza Planet", slug: "pizza-planet", trialEndsAt: expect.any(Date) },
      });
      expect(prisma.permission.findMany).toHaveBeenCalledWith({ where: { key: { not: "platform:manage" } } });
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: "role_1", permissionId: "perm_1" },
          { roleId: "role_1", permissionId: "perm_2" },
        ],
      });
      expect(prisma.organizationMembership.create).toHaveBeenCalledWith({
        data: { organizationId: "org_1", userId: "user_1", roleId: "role_1" },
      });
      expect(tokens.accessToken).toBe("signed.jwt.token");
    });

    it("de-duplicates the slug when an organization with the same name already exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValueOnce({ id: "org_existing" }).mockResolvedValueOnce(null);
      prisma.organization.create.mockResolvedValue({ id: "org_2" });
      prisma.role.create.mockResolvedValue({ id: "role_1" });
      prisma.permission.findMany.mockResolvedValue([{ id: "perm_1", key: "order:manage" }]);
      prisma.user.create.mockResolvedValue({ id: "user_1", email: dto.email });

      await service.signup(dto);

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: "Pizza Planet", slug: "pizza-planet-1", trialEndsAt: expect.any(Date) },
      });
    });

    it("opens the free trial for exactly TRIAL_DAYS, not merely 'some date'", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: "org_1", name: "Pizza Planet", slug: "pizza-planet" });
      prisma.role.create.mockResolvedValue({ id: "role_1" });
      prisma.permission.findMany.mockResolvedValue([{ id: "perm_1", key: "order:manage" }]);
      prisma.user.create.mockResolvedValue({ id: "user_1", email: dto.email });

      const before = Date.now();
      await service.signup(dto);

      const after = Date.now();

      const { trialEndsAt } = prisma.organization.create.mock.calls[0][0].data as { trialEndsAt: Date };
      const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
      // Bracketed by the clock either side of the call, so this pins the length to the
      // millisecond without depending on how long signup took to run.
      expect(trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + trialMs);
      expect(trialEndsAt.getTime()).toBeLessThanOrEqual(after + trialMs);
    });
  });

  it("rejects login for a wrong password and registers the failed attempt", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordHash: await bcrypt.hash("correct-password", 4),
    });
    await expect(service.validateCredentials("user@example.com", "wrong-password")).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginAttempts: 1, lockedUntil: undefined },
    });
  });

  it("locks the account once failed attempts reach the configured threshold", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      failedLoginAttempts: 4,
      lockedUntil: null,
      passwordHash: await bcrypt.hash("correct-password", 4),
    });
    await expect(service.validateCredentials("user@example.com", "wrong-password")).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginAttempts: 5, lockedUntil: expect.any(Date) },
    });
  });

  it("rejects a correct password outright while the account is still locked", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      isActive: true,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
      passwordHash: await bcrypt.hash("correct-password", 4),
    });
    await expect(service.validateCredentials("user@example.com", "correct-password")).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("issues tokens on successful login", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordHash: await bcrypt.hash("correct-password", 4),
    });

    const tokens = await service.login("user@example.com", "correct-password");

    expect(tokens.accessToken).toBe("signed.jwt.token");
    expect(tokens.refreshToken).toHaveLength(72);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("resets the failed-attempt counter on a successful login", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      isActive: true,
      failedLoginAttempts: 2,
      lockedUntil: null,
      passwordHash: await bcrypt.hash("correct-password", 4),
    });

    await service.login("user@example.com", "correct-password");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it("revokes the whole token family on refresh-token reuse", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      family: "fam1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000),
      userId: "u1",
    });

    await expect(service.refresh("stolen-token")).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { family: "fam1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("listSessions() collapses each token family to a single session", async () => {
    const now = new Date();
    prisma.refreshToken.findMany.mockResolvedValue([
      { id: "rt2", family: "fam1", createdAt: now, expiresAt: now, createdByIp: "1.1.1.1" }, // latest in fam1
      { id: "rt1", family: "fam1", createdAt: now, expiresAt: now, createdByIp: "1.1.1.1" }, // older, same family
      { id: "rt3", family: "fam2", createdAt: now, expiresAt: now, createdByIp: "2.2.2.2" },
    ]);

    const sessions = await service.listSessions("u1");

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.id)).toEqual(["rt2", "rt3"]);
  });

  it("revokeSession() 404s for a session that does not belong to the caller", async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(service.revokeSession("u1", "rt_from_someone_else")).rejects.toThrow(NotFoundException);
  });

  it("revokeSession() revokes every token in that session's family", async () => {
    prisma.refreshToken.findFirst.mockResolvedValue({ id: "rt1", family: "fam1", userId: "u1" });
    await service.revokeSession("u1", "rt1");
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { family: "fam1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
