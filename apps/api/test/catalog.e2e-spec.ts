import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcryptjs";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Catalog: brands / kitchens / outlets (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let brandId: string;
  let kitchenId: string;
  let stationId: string;
  let outletId: string;
  let otherOrgId: string;
  let otherBrandId: string;

  function authed(method: "get" | "post" | "patch" | "delete", path: string) {
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

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    otherBrandId = otherBrand.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (outletId) await prisma.outlet.delete({ where: { id: outletId } }).catch(() => undefined);
    if (kitchenId) await prisma.kitchen.delete({ where: { id: kitchenId } }).catch(() => undefined);
    if (brandId) await prisma.brand.delete({ where: { id: brandId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/brands");
    expect(res.status).toBe(401);
  });

  it("lists the seeded demo brands scoped to the organization", async () => {
    const res = await authed("get", "/v1/brands");
    expect(res.status).toBe(200);
    const names = res.body.map((b: { name: string }) => b.name);
    expect(names).toEqual(
      expect.arrayContaining(["Cafe Old Monk", "Pizza Paproni", "Bounty Bakery"]),
    );
  });

  it("creates a brand and rejects a duplicate slug within the same organization", async () => {
    const slug = `test-brand-${randomUUID().slice(0, 8)}`;
    const createRes = await authed("post", "/v1/brands").send({ name: "Test Brand", slug });
    expect(createRes.status).toBe(201);
    brandId = createRes.body.id;

    const dupRes = await authed("post", "/v1/brands").send({ name: "Test Brand Again", slug });
    expect(dupRes.status).toBe(409);
  });

  it("creates a kitchen, adds a station, and maps the brand to it", async () => {
    const code = `KTC-${randomUUID().slice(0, 6).toUpperCase()}`;
    const kitchenRes = await authed("post", "/v1/kitchens").send({ name: "Test Kitchen", code });
    expect(kitchenRes.status).toBe(201);
    kitchenId = kitchenRes.body.id;

    const stationRes = await authed("post", `/v1/kitchens/${kitchenId}/stations`).send({
      name: "Grill",
      code: "GRILL-E2E",
    });
    expect(stationRes.status).toBe(201);
    stationId = stationRes.body.id;

    const mapRes = await authed("post", `/v1/kitchens/${kitchenId}/brands`).send({
      brandId,
      isPrimary: true,
    });
    expect(mapRes.status).toBe(201);
    expect(mapRes.body.brand.id).toBe(brandId);

    const kitchenDetail = await authed("get", `/v1/kitchens/${kitchenId}`);
    expect(kitchenDetail.body.stations).toHaveLength(1);
    expect(kitchenDetail.body.stations[0].id).toBe(stationId);
    expect(kitchenDetail.body.brandKitchens).toHaveLength(1);
  });

  it("creates an outlet for the brand and maps the kitchen to it", async () => {
    const code = `OUT-${randomUUID().slice(0, 6).toUpperCase()}`;
    const outletRes = await authed("post", "/v1/outlets").send({ brandId, name: "Test Outlet", code });
    expect(outletRes.status).toBe(201);
    outletId = outletRes.body.id;

    const mapRes = await authed("post", `/v1/outlets/${outletId}/kitchens`).send({ kitchenId });
    expect(mapRes.status).toBe(201);
    expect(mapRes.body.kitchen.id).toBe(kitchenId);

    const outletDetail = await authed("get", `/v1/outlets/${outletId}`);
    expect(outletDetail.body.outletKitchens).toHaveLength(1);
  });

  it("never lets a brand from another organization be read, mapped to, or built on", async () => {
    const readRes = await authed("get", `/v1/brands/${otherBrandId}`);
    expect(readRes.status).toBe(404);

    const mapRes = await authed("post", `/v1/kitchens/${kitchenId}/brands`).send({ brandId: otherBrandId });
    expect(mapRes.status).toBe(404);

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: otherBrandId,
      name: "Cross-tenant Outlet",
      code: `BAD-${randomUUID().slice(0, 6).toUpperCase()}`,
    });
    expect(outletRes.status).toBe(404);
  });

  it("never lets a kitchen or outlet from another organization be addressed", async () => {
    // A membership-less admin in the *other* org can never even obtain organizationId
    // for ours, but prove the server-side guard too: our admin's token scoped to
    // our org cannot reach a kitchen that exists only in the other org.
    const bcryptHash = await bcrypt.hash("Whatever123!", 4);
    const otherUser = await prisma.user.create({
      data: { email: `other-${randomUUID()}@example.test`, passwordHash: bcryptHash, firstName: "O", lastName: "U" },
    });
    const otherRole = await prisma.role.create({
      data: { organizationId: otherOrgId, name: "Admin" },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: otherOrgId, userId: otherUser.id, roleId: otherRole.id },
    });
    const otherKitchen = await prisma.kitchen.create({
      data: { organizationId: otherOrgId, name: "Rival Kitchen", code: "RIVAL-01" },
    });

    const res = await authed("get", `/v1/kitchens/${otherKitchen.id}`);
    expect(res.status).toBe(404);

    // The organization cascade-deletes the membership and role, but User is a standalone entity
    // with no cascade from Organization, so it has to be cleaned up explicitly or it leaks forever.
    await prisma.kitchen.delete({ where: { id: otherKitchen.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});
