import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Growth dashboard (e2e, Prompt 20)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;

  // A dedicated, never-otherwise-touched outlet, the same isolation technique report.e2e-spec.ts
  // uses, so this outlet's revenue figure is exact rather than delta-based against seed noise.
  let dashboardOutletId: string;
  let dashboardOrderId: string;

  function authed(method: "get" | "post", path: string) {
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

    const brandsRes = await authed("get", "/v1/brands");
    paproniBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "pizza-paproni").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - Dashboard Test",
      code: "PP-DASH-01",
    });
    dashboardOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: dashboardOutletId });

    const productsRes = await authed("get", `/v1/products?brandId=${paproniBrandId}`);
    const margherita = productsRes.body.find((p: { sku: string }) => p.sku === "PP-MARG");
    const margheritaMediumVariantId = margherita.variants.find((v: { name: string }) => v.name === "Medium").id;

    const orderRes = await authed("post", "/v1/orders").send({ outletId: dashboardOutletId, channel: "DINE_IN" });
    dashboardOrderId = orderRes.body.id;
    await authed("post", `/v1/orders/${dashboardOrderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });
    await authed("post", `/v1/orders/${dashboardOrderId}/payments`).send({ method: "CASH", amount: "500.00" });
  });

  afterAll(async () => {
    if (dashboardOrderId) await prisma.order.delete({ where: { id: dashboardOrderId } }).catch(() => undefined);
    if (dashboardOutletId) await prisma.outlet.delete({ where: { id: dashboardOutletId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/dashboard/growth");
    expect(res.status).toBe(401);
  });

  it("reconciles total revenue with the sales-summary report for the same filter", async () => {
    const [dashboardRes, salesSummaryRes] = await Promise.all([
      authed("get", `/v1/dashboard/growth?outletId=${dashboardOutletId}`),
      authed("get", `/v1/reports/sales-summary?outletId=${dashboardOutletId}`),
    ]);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.totalRevenue).toBe(salesSummaryRes.body.total);
  });

  it("includes this outlet's own profitability row, reconciled against outlet-demand's revenue", async () => {
    const [dashboardRes, outletDemandRes] = await Promise.all([
      authed("get", `/v1/dashboard/growth?outletId=${dashboardOutletId}`),
      authed("get", `/v1/reports/outlet-demand?outletId=${dashboardOutletId}`),
    ]);
    const outletRow = dashboardRes.body.outletProfitability.find((o: { outletId: string }) => o.outletId === dashboardOutletId);
    expect(outletRow).toBeDefined();
    expect(outletRow.revenue).toBe(outletDemandRes.body[0].revenue);
    // profit = revenue - cogs - expenses; this outlet has no recorded expenses.
    expect(outletRow.expenses).toBe("0");
  });

  it("includes this brand's profitability row, reconciled against brand-demand's revenue", async () => {
    const [dashboardRes, brandDemandRes] = await Promise.all([
      authed("get", `/v1/dashboard/growth?outletId=${dashboardOutletId}`),
      authed("get", `/v1/reports/brand-demand?outletId=${dashboardOutletId}`),
    ]);
    const brandRow = dashboardRes.body.brandProfitability.find((b: { brandId: string }) => b.brandId === paproniBrandId);
    expect(brandRow).toBeDefined();
    expect(brandRow.revenue).toBe(brandDemandRes.body[0].revenue);
  });

  it("reports product performance identical to the top-products report for the same filter", async () => {
    const [dashboardRes, topProductsRes] = await Promise.all([
      authed("get", `/v1/dashboard/growth?outletId=${dashboardOutletId}`),
      authed("get", `/v1/reports/top-products?outletId=${dashboardOutletId}`),
    ]);
    expect(dashboardRes.body.productPerformance).toEqual(topProductsRes.body);
  });

  it("reports an honest zero/null for SMS campaign ROI, with an explanatory scope-boundary note", async () => {
    const res = await authed("get", "/v1/dashboard/growth");
    expect(res.status).toBe(200);
    expect(res.body.campaignROI.sms.roiPercent).toBeNull();
    expect(res.body.campaignROI.sms.note).toMatch(/WhatsApp-only/);
  });

  it("returns the customer repeat rate, loyalty point liability and promotion opportunity shapes", async () => {
    const res = await authed("get", "/v1/dashboard/growth");
    expect(res.status).toBe(200);
    expect(res.body.customerRepeatRate).toEqual(
      expect.objectContaining({ totalCustomers: expect.any(Number), repeatCustomers: expect.any(Number), repeatRatePercent: expect.any(Number) }),
    );
    expect(res.body.loyaltyPointLiability).toEqual(
      expect.objectContaining({ totalPoints: expect.any(Number), redemptionRatio: expect.any(String), estimatedLiability: expect.any(String) }),
    );
    expect(res.body.promotionOpportunities).toEqual(
      expect.objectContaining({
        discountCandidates: expect.any(Array),
        comboCandidates: expect.any(Array),
        segmentCandidates: expect.any(Array),
      }),
    );
    expect(Array.isArray(res.body.stockoutRisks)).toBe(true);
    expect(Array.isArray(res.body.purchaseRecommendations)).toBe(true);
  });

  it("scopes stockout risk/purchase recommendations to a single kitchen when kitchenId is given", async () => {
    const kitchensRes = await authed("get", "/v1/kitchens");
    const kitchenId = kitchensRes.body[0].id;
    const res = await authed("get", `/v1/dashboard/growth?kitchenId=${kitchenId}`);
    expect(res.status).toBe(200);
    for (const risk of res.body.stockoutRisks) expect(risk.kitchenId).toBe(kitchenId);
  });
});
