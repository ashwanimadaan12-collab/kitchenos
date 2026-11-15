import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("POS billing (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let brandId: string;
  let categoryId: string;
  let outletId: string;
  let coffeeVariantId: string;
  let sandwichVariantId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let orderId: string;
  let voidTestOrderId: string;
  let offMenuProductId: string;
  let otherOrgId: string;
  let otherOutletId: string;
  let otherVariantId: string;
  let otherOrderId: string;

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

    const brandsRes = await authed("get", "/v1/brands");
    const oldMonk = brandsRes.body.find((b: { slug: string }) => b.slug === "cafe-old-monk");
    brandId = oldMonk.id;

    const categoriesRes = await authed("get", `/v1/product-categories?brandId=${brandId}`);
    categoryId = categoriesRes.body[0].id;

    const outletsRes = await authed("get", "/v1/outlets");
    outletId = outletsRes.body.find((o: { code: string }) => o.code === "OM-SKT-01").id;

    const productsRes = await authed("get", `/v1/products?brandId=${brandId}`);
    const coffee = productsRes.body.find((p: { sku: string }) => p.sku === "OM-COFFEE");
    coffeeVariantId = coffee.variants.find((v: { name: string }) => v.name === "Regular").id;
    const sandwich = productsRes.body.find((p: { sku: string }) => p.sku === "OM-SAND");
    sandwichVariantId = sandwich.variants.find((v: { name: string }) => v.name === "Regular").id;

    // A product that exists in our org but is on no menu, to prove the
    // "sellable at this outlet" business rule is enforced, not just tenancy.
    const offMenuProduct = await prisma.product.create({
      data: {
        organizationId,
        brandId,
        categoryId,
        name: "Off-menu Test Item",
        sku: `OFFMENU-${randomUUID().slice(0, 6).toUpperCase()}`,
        variants: { create: [{ name: "Regular", sku: `OFFMENU-REG-${randomUUID().slice(0, 6)}`, basePrice: "10.00" }] },
      },
      include: { variants: true },
    });
    offMenuProductId = offMenuProduct.id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Outlet", code: "RIVAL-ORD-OUT-01" },
    });
    otherOutletId = otherOutlet.id;
    const otherCategory = await prisma.productCategory.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Category" },
    });
    const otherProduct = await prisma.product.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrand.id,
        categoryId: otherCategory.id,
        name: "Rival Product",
        sku: "RIVAL-ORDER-SKU",
        variants: { create: [{ name: "Regular", sku: "RIVAL-ORDER-SKU-REG", basePrice: "10.00" }] },
      },
      include: { variants: true },
    });
    const otherVariant = otherProduct.variants[0];
    if (!otherVariant) throw new Error("expected the other org's seed product to have a variant");
    otherVariantId = otherVariant.id;
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: otherOrgId,
        outletId: otherOutletId,
        orderNumber: 1,
        channel: "DINE_IN",
        createdByUserId: (await prisma.user.findFirstOrThrow()).id,
      },
    });
    otherOrderId = otherOrder.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (orderId) await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    if (voidTestOrderId) await prisma.order.delete({ where: { id: voidTestOrderId } }).catch(() => undefined);
    if (offMenuProductId) await prisma.product.delete({ where: { id: offMenuProductId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app.getHttpServer()).get("/v1/orders");
    expect(res.status).toBe(401);
  });

  it("refuses to open an order at an outlet from another organization", async () => {
    const res = await authed("post", "/v1/orders").send({ outletId: otherOutletId, channel: "DINE_IN" });
    expect(res.status).toBe(404);
  });

  it("opens an order, adds items, edits a quantity, and voids a line", async () => {
    const createRes = await authed("post", "/v1/orders").send({ outletId, channel: "DINE_IN" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("OPEN");
    expect(typeof createRes.body.orderNumber).toBe("number");
    orderId = createRes.body.id;

    const addCoffeeRes = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: coffeeVariantId,
      quantity: 2,
    });
    expect(addCoffeeRes.status).toBe(201);
    // Filter Coffee Regular: base 60.00, GST 5% -> 2 * 60 = 120 subtotal, 6 tax, 126 line total.
    expect(addCoffeeRes.body.subtotal).toBe("120");
    expect(addCoffeeRes.body.taxTotal).toBe("6");
    expect(addCoffeeRes.body.total).toBe("126");

    const addSandwichRes = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: sandwichVariantId,
      quantity: 1,
    });
    expect(addSandwichRes.status).toBe(201);
    // + Veg Sandwich Regular: 120 subtotal, 6 tax -> running total 240 subtotal, 12 tax, 252 total.
    expect(addSandwichRes.body.subtotal).toBe("240");
    expect(addSandwichRes.body.total).toBe("252");
    const sandwichItem = addSandwichRes.body.items.find((i: { variantId: string }) => i.variantId === sandwichVariantId);

    const updateQtyRes = await authed("patch", `/v1/orders/${orderId}/items/${sandwichItem.id}`).send({ quantity: 2 });
    expect(updateQtyRes.status).toBe(200);
    // Sandwich now x2: 240 subtotal, 12 tax -> running total 360 subtotal, 18 tax, 378 total.
    expect(updateQtyRes.body.total).toBe("378");

    const voidItemRes = await authed("delete", `/v1/orders/${orderId}/items/${sandwichItem.id}`);
    expect(voidItemRes.status).toBe(200);
    // Back down to just the coffee line.
    expect(voidItemRes.body.total).toBe("126");
    expect(voidItemRes.body.items.find((i: { id: string }) => i.id === sandwichItem.id).status).toBe("VOIDED");
  });

  it("refuses to sell a product that exists but is on no active menu at the outlet", async () => {
    const offMenuProduct = await prisma.product.findUniqueOrThrow({
      where: { id: offMenuProductId },
      include: { variants: true },
    });
    const res = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: offMenuProduct.variants[0]?.id,
      quantity: 1,
    });
    expect(res.status).toBe(404);
  });

  it("takes a full payment and closes the order, then refuses further changes", async () => {
    const payRes = await authed("post", `/v1/orders/${orderId}/payments`).send({ method: "CASH", amount: "126.00" });
    expect(payRes.status).toBe(201);
    expect(payRes.body.status).toBe("PAID");
    expect(payRes.body.payments).toHaveLength(1);

    const addAfterPaidRes = await authed("post", `/v1/orders/${orderId}/items`).send({
      variantId: coffeeVariantId,
      quantity: 1,
    });
    expect(addAfterPaidRes.status).toBe(409);

    const voidAfterPaidRes = await authed("post", `/v1/orders/${orderId}/void`);
    expect(voidAfterPaidRes.status).toBe(409);
  });

  it("voids an order that has no payments", async () => {
    const createRes = await authed("post", "/v1/orders").send({ outletId, channel: "TAKEAWAY" });
    voidTestOrderId = createRes.body.id;

    const voidRes = await authed("post", `/v1/orders/${voidTestOrderId}/void`);
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.status).toBe("VOIDED");
  });

  it("never lets an outlet, variant, or order from another organization be used or read", async () => {
    const freshOrderRes = await authed("post", "/v1/orders").send({ outletId, channel: "DINE_IN" });
    const freshOrderId = freshOrderRes.body.id;

    const crossItemRes = await authed("post", `/v1/orders/${freshOrderId}/items`).send({
      variantId: otherVariantId,
      quantity: 1,
    });
    expect(crossItemRes.status).toBe(404);

    const readOtherOrderRes = await authed("get", `/v1/orders/${otherOrderId}`);
    expect(readOtherOrderRes.status).toBe(404);

    await prisma.order.delete({ where: { id: freshOrderId } }).catch(() => undefined);
  });
});
