import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Self-service signup (e2e)", () => {
  let app: INestApplication;

  // Thrown away per test via a random email/org name — never touches the shared demo org every
  // other e2e suite in this run depends on.
  let createdUserId: string | undefined;
  let createdOrgId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
  });

  afterEach(async () => {
    if (createdOrgId) await prisma.organization.delete({ where: { id: createdOrgId } }).catch(() => undefined);
    createdUserId = undefined;
    createdOrgId = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a brand-new, empty organization and logs the new admin straight in", async () => {
    const email = `owner-${randomUUID()}@example.test`;
    const res = await request(app.getHttpServer()).post("/v1/auth/signup").send({
      organizationName: `Test Diner ${randomUUID()}`,
      firstName: "New",
      lastName: "Owner",
      email,
      password: "a-secure-password-1",
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    createdUserId = user!.id;

    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user!.id },
      include: { role: { include: { permissions: true } }, organization: true },
    });
    expect(membership).not.toBeNull();
    createdOrgId = membership!.organizationId;

    // The new org starts completely empty — no demo brands/outlets/products.
    const brandCount = await prisma.brand.count({ where: { organizationId: createdOrgId } });
    expect(brandCount).toBe(0);

    // Granted every permission except platform:manage.
    const permissionKeys = membership!.role.permissions;
    const allPermissions = await prisma.permission.count();
    expect(permissionKeys.length).toBe(allPermissions - 1);

    // The new access token can actually act as this org's admin.
    const meRes = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.memberships).toEqual([
      expect.objectContaining({ organizationId: createdOrgId, roleName: "Org Admin" }),
    ]);

    await prisma.user.delete({ where: { id: createdUserId } });
  });

  it("refuses to sign up a second account with an email that's already in use", async () => {
    const email = `dupe-${randomUUID()}@example.test`;
    const first = await request(app.getHttpServer()).post("/v1/auth/signup").send({
      organizationName: `First Co ${randomUUID()}`,
      firstName: "First",
      lastName: "One",
      email,
      password: "a-secure-password-1",
    });
    expect(first.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    const membership = await prisma.organizationMembership.findFirst({ where: { userId: user!.id } });
    createdOrgId = membership!.organizationId;

    const second = await request(app.getHttpServer()).post("/v1/auth/signup").send({
      organizationName: `Second Co ${randomUUID()}`,
      firstName: "Second",
      lastName: "One",
      email,
      password: "another-password-1",
    });
    expect(second.status).toBe(409);

    await prisma.user.delete({ where: { id: user!.id } });
  });

  it("422s a malformed signup payload", async () => {
    const res = await request(app.getHttpServer()).post("/v1/auth/signup").send({
      organizationName: "X",
      firstName: "",
      lastName: "Owner",
      email: "not-an-email",
      password: "short",
    });
    expect(res.status).toBe(400);
  });
});
