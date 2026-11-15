import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";

describe("Promotion Recommendations (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;

  function authed(method: "get" | "post" | "patch" | "put" | "delete", path: string) {
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
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/promotions/recommendations/discount-candidates");
    expect(res.status).toBe(401);
  });

  it("discount-candidates returns a ranked, explainable shape", async () => {
    const res = await authed("get", "/v1/promotions/recommendations/discount-candidates");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const candidate of res.body) {
      expect(candidate).toEqual(
        expect.objectContaining({
          variantId: expect.any(String),
          productName: expect.any(String),
          quantitySoldLast90Days: expect.any(Number),
          isCandidate: true,
        }),
      );
      // A candidate's own margin is, by construction, at least the healthy-margin threshold.
      expect(Number(candidate.marginPercent)).toBeGreaterThanOrEqual(30);
    }
  });

  it("combo-candidates includes the seeded combo, ranked by fewest instances sold", async () => {
    const res = await authed("get", "/v1/promotions/recommendations/combo-candidates");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const seeded = res.body.find((c: { name: string }) => c.name === "Margherita + Garlic Bread Combo");
    expect(seeded).toBeDefined();
    expect(seeded.instancesSoldLast90Days).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].instancesSoldLast90Days).toBeGreaterThanOrEqual(res.body[i - 1].instancesSoldLast90Days);
    }
  });

  it("segment-candidates recommends the seeded inactive segment ahead of a non-inactive one", async () => {
    const res = await authed("get", "/v1/promotions/recommendations/segment-candidates");
    expect(res.status).toBe(200);
    const inactive = res.body.find((s: { name: string }) => s.name === "Inactive 90+ days");
    expect(inactive).toBeDefined();
    expect(inactive.recommended).toBe(true);
    const everyone = res.body.find((s: { name: string }) => s.name === "Everyone");
    const inactiveIndex = res.body.findIndex((s: { name: string }) => s.name === "Inactive 90+ days");
    const everyoneIndex = res.body.findIndex((s: { name: string }) => s.name === "Everyone");
    expect(inactiveIndex).toBeLessThan(everyoneIndex);
  });

  it("campaign-results only includes completed/running campaigns, sorted by conversion rate descending", async () => {
    const res = await authed("get", "/v1/promotions/recommendations/campaign-results");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body) {
      expect(["COMPLETED", "RUNNING"]).toContain(row.status);
    }
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].stats.conversionRate).toBeLessThanOrEqual(res.body[i - 1].stats.conversionRate);
    }
  });

  it("minimum-price 404s for a variant from another organization's reach (nonexistent id)", async () => {
    const res = await authed("get", "/v1/promotions/recommendations/minimum-price/nonexistent-variant-id");
    expect(res.status).toBe(404);
  });
});
