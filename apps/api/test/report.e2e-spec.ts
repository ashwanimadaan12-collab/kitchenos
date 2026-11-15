import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Reports (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let margheritaMediumVariantId: string;
  let garlicBreadVariantId: string;
  let comboId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean. A dedicated,
  // never-otherwise-touched outlet keeps every assertion below exact instead of delta-based,
  // since nothing else in the e2e suite can contribute revenue to it.
  let reportOutletId: string;
  let reportOrderId: string;

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

    const productsRes = await authed("get", `/v1/products?brandId=${paproniBrandId}`);
    const margherita = productsRes.body.find((p: { sku: string }) => p.sku === "PP-MARG");
    margheritaMediumVariantId = margherita.variants.find((v: { name: string }) => v.name === "Medium").id;
    const garlicBread = productsRes.body.find((p: { sku: string }) => p.sku === "PP-GARLIC");
    garlicBreadVariantId = garlicBread.variants.find((v: { name: string }) => v.name === "Regular").id;

    const combosRes = await authed("get", `/v1/combos?brandId=${paproniBrandId}`);
    comboId = combosRes.body.find((c: { name: string }) => c.name === "Margherita + Garlic Bread Combo").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - Report Test",
      code: "PP-RPT-01",
    });
    reportOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: reportOutletId });

    const orderRes = await authed("post", "/v1/orders").send({ outletId: reportOutletId, channel: "DINE_IN" });
    reportOrderId = orderRes.body.id;
    // One instance of the seeded combo (₹430): allocates to ₹301.35 (Margherita Medium, 18% GST)
    // and ₹128.65 (Garlic Bread, 18% GST) -> subtotal 430, tax 77.40.
    await authed("post", `/v1/orders/${reportOrderId}/combo-items`).send({ comboId, quantity: 1 });
    // WELCOME10: 10% of the 430 subtotal, capped at ₹100 -> discount 43. Total: 430 + 77.40 - 43 = 464.40.
    await authed("post", `/v1/orders/${reportOrderId}/promotion`).send({ code: "WELCOME10" });
    await authed("post", `/v1/orders/${reportOrderId}/payments`).send({ method: "CASH", amount: "200.00" });
    await authed("post", `/v1/orders/${reportOrderId}/payments`).send({ method: "CARD", amount: "264.40" });
  });

  afterAll(async () => {
    // Order deleted first: Order.outletId is onDelete: Restrict, so the outlet delete below would
    // otherwise fail (or, if attempted inside the same cascade, silently roll back).
    if (reportOrderId) await prisma.order.delete({ where: { id: reportOrderId } }).catch(() => undefined);
    if (reportOutletId) await prisma.outlet.delete({ where: { id: reportOutletId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/reports/sales-summary");
    expect(res.status).toBe(401);
  });

  it("sales-summary reports exactly the one PAID order at this outlet, net of its discount", async () => {
    const res = await authed("get", `/v1/reports/sales-summary?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBe(1);
    expect(res.body.subtotal).toBe("430");
    expect(res.body.taxTotal).toBe("77.4");
    expect(res.body.discountAmount).toBe("43");
    expect(res.body.total).toBe("464.4");
    expect(res.body.averageOrderValue).toBe("464.4");
  });

  it("sales-summary returns an empty (zeroed) report for a future date range", async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await authed("get", `/v1/reports/sales-summary?outletId=${reportOutletId}&from=${farFuture}`);
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBe(0);
    expect(res.body.total).toBe("0");
  });

  it("sales-summary returns nothing for a channel the order wasn't placed under", async () => {
    const res = await authed("get", `/v1/reports/sales-summary?outletId=${reportOutletId}&channel=DELIVERY`);
    expect(res.body.orderCount).toBe(0);
  });

  it("sales-by-day includes today's revenue for this outlet", async () => {
    const res = await authed("get", `/v1/reports/sales-by-day?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].date).toBe(new Date().toISOString().slice(0, 10));
    expect(res.body[0].total).toBe("464.4");
  });

  it("top-products attributes revenue to each combo component variant individually", async () => {
    const res = await authed("get", `/v1/reports/top-products?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    const margheritaRow = res.body.find((r: { variantId: string }) => r.variantId === margheritaMediumVariantId);
    const garlicRow = res.body.find((r: { variantId: string }) => r.variantId === garlicBreadVariantId);
    expect(margheritaRow).toEqual(
      expect.objectContaining({ productName: "Margherita", variantName: "Medium", quantitySold: 1, revenue: "301.35" }),
    );
    expect(garlicRow).toEqual(
      expect.objectContaining({ productName: "Garlic Bread", variantName: "Regular", quantitySold: 1, revenue: "128.65" }),
    );
  });

  it("combo-performance counts one instance sold, not one row per component", async () => {
    const res = await authed("get", `/v1/reports/combo-performance?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { comboId, name: "Margherita + Garlic Bread Combo", instancesSold: 1, revenue: "430" },
    ]);
  });

  it("payment-methods breaks the total down by how it was actually paid", async () => {
    const res = await authed("get", `/v1/reports/payment-methods?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    const byMethod = Object.fromEntries(res.body.map((r: { method: string; amount: string }) => [r.method, r.amount]));
    expect(byMethod.CASH).toBe("200");
    expect(byMethod.CARD).toBe("264.4");
  });

  it("promotions report counts the redemption and the discount it actually gave", async () => {
    const res = await authed("get", `/v1/reports/promotions?outletId=${reportOutletId}`);
    expect(res.status).toBe(200);
    const welcome10 = res.body.find((r: { code: string }) => r.code === "WELCOME10");
    expect(welcome10).toEqual(expect.objectContaining({ redemptions: 1, totalDiscount: "43" }));
  });

  describe("demand analytics (Prompt 17)", () => {
    const now = new Date();
    const todayUtcDay = now.getUTCDay();
    const todayUtcHour = now.getUTCHours();

    it("weekday-distribution fills all 7 days, with today's revenue on today's day of week", async () => {
      const res = await authed("get", `/v1/reports/weekday-distribution?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(7);
      const today = res.body.find((d: { dayOfWeek: number }) => d.dayOfWeek === todayUtcDay);
      expect(today).toEqual(expect.objectContaining({ orderCount: 1, revenue: "464.4", averageOrderValue: "464.4" }));
      const totalOrders = res.body.reduce((sum: number, d: { orderCount: number }) => sum + d.orderCount, 0);
      expect(totalOrders).toBe(1);
    });

    it("hourly-distribution fills all 24 hours, with today's revenue on this hour", async () => {
      const res = await authed("get", `/v1/reports/hourly-distribution?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(24);
      const thisHour = res.body.find((h: { hour: number }) => h.hour === todayUtcHour);
      expect(thisHour).toEqual(expect.objectContaining({ orderCount: 1, revenue: "464.4" }));
    });

    it("demand-heatmap returns exactly the one weekday x hour cell this order falls into", async () => {
      const res = await authed("get", `/v1/reports/demand-heatmap?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ dayOfWeek: todayUtcDay, hour: todayUtcHour, orderCount: 1, revenue: "464.4" }]);
    });

    it("peak-slow-hours reports the same single hour as both peak and slow when there's only one order", async () => {
      const res = await authed("get", `/v1/reports/peak-slow-hours?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body.peakHour).toEqual({ hour: todayUtcHour, orderCount: 1, revenue: "464.4" });
      expect(res.body.slowHour).toEqual({ hour: todayUtcHour, orderCount: 1, revenue: "464.4" });
    });

    it("monthly-trend includes this calendar month's revenue for this outlet", async () => {
      const res = await authed("get", `/v1/reports/monthly-trend?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      const thisMonth = res.body.find((m: { month: string }) => m.month === now.toISOString().slice(0, 7));
      expect(thisMonth).toEqual(expect.objectContaining({ orderCount: 1, revenue: "464.4" }));
    });

    it("brand-demand rolls this outlet's order up to Pizza Paproni", async () => {
      const res = await authed("get", `/v1/reports/brand-demand?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ brandName: "Pizza Paproni", orderCount: 1, revenue: "464.4" }),
      ]);
    });

    it("outlet-demand reports exactly this outlet's one order", async () => {
      const res = await authed("get", `/v1/reports/outlet-demand?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ outletId: reportOutletId, outletName: "Paproni - Report Test", orderCount: 1, revenue: "464.4" }),
      ]);
    });

    it("channel-demand reports exactly this order's DINE_IN channel", async () => {
      const res = await authed("get", `/v1/reports/channel-demand?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([expect.objectContaining({ channel: "DINE_IN", orderCount: 1, revenue: "464.4" })]);
    });

    it("promotion-recommendations flags nothing when the only slot in the window is the average, not an outlier", async () => {
      const res = await authed("get", `/v1/reports/promotion-recommendations?outletId=${reportOutletId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
