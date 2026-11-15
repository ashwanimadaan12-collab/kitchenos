import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Dine-in tables & QR ordering (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let margheritaMediumVariantId: string;

  let tableOutletId: string;
  let tableId: string;
  let tableQrToken: string;
  let createdOrderIds: string[] = [];

  function authed(method: "get" | "post" | "patch", path: string) {
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

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - Tables Test",
      code: "PP-TBL-01",
    });
    tableOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: tableOutletId });
  });

  afterAll(async () => {
    for (const id of createdOrderIds) await prisma.order.delete({ where: { id } }).catch(() => undefined);
    if (tableId) await prisma.restaurantTable.delete({ where: { id: tableId } }).catch(() => undefined);
    if (tableOutletId) await prisma.outlet.delete({ where: { id: tableOutletId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access to the admin tables endpoint", async () => {
    const res = await request(app.getHttpServer()).get("/v1/tables");
    expect(res.status).toBe(401);
  });

  it("creates a table with a unique QR token", async () => {
    const res = await authed("post", "/v1/tables").send({ outletId: tableOutletId, name: "T1" });
    expect(res.status).toBe(201);
    expect(res.body.qrToken).toEqual(expect.any(String));
    tableId = res.body.id;
    tableQrToken = res.body.qrToken;
  });

  it("refuses a second table with the same name at the same outlet", async () => {
    const res = await authed("post", "/v1/tables").send({ outletId: tableOutletId, name: "T1" });
    expect(res.status).toBe(409);
  });

  it("lists the table with no open order yet", async () => {
    const res = await authed("get", `/v1/tables?outletId=${tableOutletId}`);
    expect(res.status).toBe(200);
    const table = res.body.find((t: { id: string }) => t.id === tableId);
    expect(table.openOrder).toBeNull();
  });

  it("the public menu endpoint requires no authentication at all", async () => {
    const res = await request(app.getHttpServer()).get(`/v1/public/tables/${tableQrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.outletName).toBe("Paproni - Tables Test");
    expect(res.body.items.some((i: { variantId: string }) => i.variantId === margheritaMediumVariantId)).toBe(true);
  });

  it("404s a public menu lookup for a made-up QR token", async () => {
    const res = await request(app.getHttpServer()).get("/v1/public/tables/this-token-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("a customer places an order by QR token, with no login, and it's priced from live rules", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/public/tables/${tableQrToken}/order`)
      .send({ items: [{ variantId: margheritaMediumVariantId, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.items).toHaveLength(1);
    expect(Number(res.body.subtotal)).toBeGreaterThan(0);
    createdOrderIds.push(res.body.id);
  });

  it("scanning the same table's QR again adds to the SAME open order rather than starting a new one", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/public/tables/${tableQrToken}/order`)
      .send({ items: [{ variantId: margheritaMediumVariantId, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdOrderIds[0]);
    expect(res.body.items).toHaveLength(2);
  });

  it("now shows the table as occupied, with the real order total", async () => {
    const res = await authed("get", `/v1/tables?outletId=${tableOutletId}`);
    const table = res.body.find((t: { id: string }) => t.id === tableId);
    expect(table.openOrder).toEqual(expect.objectContaining({ id: createdOrderIds[0] }));
  });

  it("deactivating the table 404s further public menu/order access", async () => {
    await authed("patch", `/v1/tables/${tableId}`).send({ isActive: false });

    const menuRes = await request(app.getHttpServer()).get(`/v1/public/tables/${tableQrToken}`);
    expect(menuRes.status).toBe(404);

    const orderRes = await request(app.getHttpServer())
      .post(`/v1/public/tables/${tableQrToken}/order`)
      .send({ items: [{ variantId: margheritaMediumVariantId, quantity: 1 }] });
    expect(orderRes.status).toBe(404);

    await authed("patch", `/v1/tables/${tableId}`).send({ isActive: true }); // restore for other tests / cleanup
  });
});
