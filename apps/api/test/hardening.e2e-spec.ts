import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("SaaS hardening (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;

  // A throwaway, never-otherwise-touched login so the lockout tests below can't affect the
  // shared demo admin account that every other e2e suite in this run depends on.
  let lockoutUserId: string;
  const lockoutEmail = `lockout-${randomUUID()}@example.test`;
  const lockoutPassword = "Correct-Horse-1!";

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let supplierId: string;
  let otherOrgId: string;

  function authed(method: "get" | "post" | "delete", path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Organization-Id", organizationId);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: "admin@demo-restaurants.test", password: "ChangeMe123!" });
    accessToken = loginRes.body.accessToken;

    const orgsRes = await request(app.getHttpServer())
      .get("/v1/organizations")
      .set("Authorization", `Bearer ${accessToken}`);
    organizationId = orgsRes.body[0].id;

    const lockoutUser = await prisma.user.create({
      data: {
        email: lockoutEmail,
        passwordHash: await bcrypt.hash(lockoutPassword, 4),
        firstName: "Lockout",
        lastName: "Test",
      },
    });
    lockoutUserId = lockoutUser.id;

    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
  });

  afterAll(async () => {
    if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (lockoutUserId) {
      await prisma.refreshToken.deleteMany({ where: { userId: lockoutUserId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: lockoutUserId } }).catch(() => undefined);
    }
    await app.close();
  });

  describe("account lockout", () => {
    it("locks the account after enough consecutive failed attempts, even with the right password", async () => {
      const maxAttempts = 5; // LOGIN_LOCKOUT_MAX_ATTEMPTS default
      for (let i = 0; i < maxAttempts; i++) {
        const res = await request(app.getHttpServer())
          .post("/v1/auth/login")
          .send({ email: lockoutEmail, password: "definitely-wrong" });
        expect(res.status).toBe(401);
      }

      const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: lockoutUserId } });
      expect(lockedUser.failedLoginAttempts).toBe(maxAttempts);
      expect(lockedUser.lockedUntil).not.toBeNull();

      const res = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: lockoutEmail, password: lockoutPassword });
      expect(res.status).toBe(401);
    });

    it("lets the account log in again once the lockout window has passed, and resets the counters", async () => {
      await prisma.user.update({
        where: { id: lockoutUserId },
        data: { lockedUntil: new Date(Date.now() - 1000) }, // simulate the cooldown having elapsed
      });

      const res = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: lockoutEmail, password: lockoutPassword });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();

      const user = await prisma.user.findUniqueOrThrow({ where: { id: lockoutUserId } });
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeNull();
    });
  });

  describe("login rate limiting", () => {
    it("throttles repeated login attempts from the same client regardless of account lockout state", async () => {
      // A dedicated app instance so this burst isn't affected by requests the other tests in
      // this file already sent against the shared `app`'s per-IP throttle counter.
      const throttleModuleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const throttleApp = await throttleModuleRef.createNestApplication();
      throttleApp.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
      await throttleApp.init();

      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(throttleApp.getHttpServer())
          .post("/v1/auth/login")
          .send({ email: `nobody-${randomUUID()}@example.test`, password: "whatever123" });
        statuses.push(res.status);
      }

      expect(statuses).toContain(429);
      await throttleApp.close();
    });
  });

  describe("sessions", () => {
    it("lists the session created by login, and revoking it blocks a further refresh", async () => {
      const loginRes = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "admin@demo-restaurants.test", password: "ChangeMe123!" });
      const sessionRefreshToken = loginRes.body.refreshToken;

      const beforeRes = await authed("get", "/v1/auth/sessions");
      expect(beforeRes.status).toBe(200);
      const sessionCountBefore = beforeRes.body.length;
      expect(sessionCountBefore).toBeGreaterThan(0);

      const latestSession = beforeRes.body[0];
      const revokeRes = await authed("delete", `/v1/auth/sessions/${latestSession.id}`);
      expect(revokeRes.status).toBe(200);

      const afterRes = await authed("get", "/v1/auth/sessions");
      expect(afterRes.body.length).toBe(sessionCountBefore - 1);

      const refreshRes = await request(app.getHttpServer())
        .post("/v1/auth/refresh")
        .send({ refreshToken: sessionRefreshToken });
      expect(refreshRes.status).toBe(401);
    });

    it("never lets a session that belongs to another user be revoked", async () => {
      const otherToken = await prisma.refreshToken.create({
        data: {
          userId: lockoutUserId,
          tokenHash: randomUUID(),
          family: randomUUID(),
          expiresAt: new Date(Date.now() + 1_000_000),
        },
      });
      const res = await authed("delete", `/v1/auth/sessions/${otherToken.id}`);
      expect(res.status).toBe(404);
      await prisma.refreshToken.delete({ where: { id: otherToken.id } });
    });
  });

  describe("audit log viewer", () => {
    it("rejects unauthenticated access", async () => {
      const res = await request(app.getHttpServer()).get("/v1/audit-logs");
      expect(res.status).toBe(401);
    });

    it("records and surfaces a real action, filterable by entity type and action", async () => {
      const createRes = await authed("post", "/v1/suppliers").send({ name: `Hardening Test Supplier ${randomUUID().slice(0, 6)}` });
      supplierId = createRes.body.id;

      const logsRes = await authed("get", "/v1/audit-logs?entityType=Supplier&action=supplier.create");
      expect(logsRes.status).toBe(200);
      expect(logsRes.body.some((entry: { entityId: string }) => entry.entityId === supplierId)).toBe(true);
    });

    it("never shows another organization's audit log entries", async () => {
      const otherEntry = await prisma.auditLog.create({
        data: { action: "rival.action", entityType: "Rival", organizationId: otherOrgId },
      });
      const res = await authed("get", "/v1/audit-logs");
      expect(res.body.some((entry: { id: string }) => entry.id === otherEntry.id)).toBe(false);
    });
  });
});
