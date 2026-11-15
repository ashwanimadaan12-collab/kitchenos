import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Combos & promotions (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniOutletId: string;
  let paproniDineInMenuId: string;
  let oldMonkBrandId: string;
  let oldMonkOutletId: string;
  let margheritaSmallVariantId: string;
  let margheritaMediumVariantId: string;
  let garlicBreadVariantId: string;
  // Deliberately NOT Filter Coffee: inventory.e2e-spec.ts asserts an exact before/after delta on Milk
  // (Filter Coffee's recipe) and Jest runs e2e files in parallel against the same dev database, so
  // selling coffee here too would race that assertion. The sandwich's ingredients aren't asserted
  // against anywhere, so it's safe to consume concurrently.
  let sandwichVariantId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let comboId: string;
  let comboOrderId: string;
  let flatPromoOrderId: string;
  let limitedPromotionId: string;
  let otherOrgId: string;
  let otherComboId: string;
  let otherPromotionId: string;

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
    paproniBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "pizza-paproni").id;
    oldMonkBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "cafe-old-monk").id;

    const outletsRes = await authed("get", "/v1/outlets");
    paproniOutletId = outletsRes.body.find((o: { code: string }) => o.code === "PP-IND-01").id;
    oldMonkOutletId = outletsRes.body.find((o: { code: string }) => o.code === "OM-SKT-01").id;

    const paproniProductsRes = await authed("get", `/v1/products?brandId=${paproniBrandId}`);
    const margherita = paproniProductsRes.body.find((p: { sku: string }) => p.sku === "PP-MARG");
    margheritaSmallVariantId = margherita.variants.find((v: { name: string }) => v.name === "Small").id;
    margheritaMediumVariantId = margherita.variants.find((v: { name: string }) => v.name === "Medium").id;
    const garlicBread = paproniProductsRes.body.find((p: { sku: string }) => p.sku === "PP-GARLIC");
    garlicBreadVariantId = garlicBread.variants.find((v: { name: string }) => v.name === "Regular").id;

    const oldMonkProductsRes = await authed("get", `/v1/products?brandId=${oldMonkBrandId}`);
    const sandwich = oldMonkProductsRes.body.find((p: { sku: string }) => p.sku === "OM-SAND");
    sandwichVariantId = sandwich.variants.find((v: { name: string }) => v.name === "Regular").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand" },
    });
    const otherCategory = await prisma.productCategory.create({
      data: { organizationId: otherOrgId, brandId: otherBrand.id, name: "Rival Category" },
    });
    const otherProduct = await prisma.product.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrand.id,
        categoryId: otherCategory.id,
        name: "Rival Product",
        sku: "RIVAL-COMBO-SKU",
        variants: {
          create: [
            { name: "A", sku: "RIVAL-COMBO-A", basePrice: "10.00" },
            { name: "B", sku: "RIVAL-COMBO-B", basePrice: "10.00" },
          ],
        },
      },
      include: { variants: true },
    });
    const otherCombo = await prisma.combo.create({
      data: {
        organizationId: otherOrgId,
        brandId: otherBrand.id,
        name: "Rival Combo",
        comboPrice: "15.00",
        items: { create: otherProduct.variants.map((v) => ({ variantId: v.id, quantity: 1 })) },
      },
    });
    otherComboId = otherCombo.id;
    const otherPromotion = await prisma.promotion.create({
      data: { organizationId: otherOrgId, code: "RIVALCODE", type: "FLAT", value: "5.00" },
    });
    otherPromotionId = otherPromotion.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    if (comboOrderId) await prisma.order.delete({ where: { id: comboOrderId } }).catch(() => undefined);
    if (flatPromoOrderId) await prisma.order.delete({ where: { id: flatPromoOrderId } }).catch(() => undefined);
    if (limitedPromotionId) await prisma.promotion.delete({ where: { id: limitedPromotionId } }).catch(() => undefined);
    if (comboId) await prisma.combo.delete({ where: { id: comboId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    const combosRes = await request(app.getHttpServer()).get("/v1/combos");
    expect(combosRes.status).toBe(401);
    const promosRes = await request(app.getHttpServer()).get("/v1/promotions");
    expect(promosRes.status).toBe(401);
  });

  it("lists the seeded combo and promotion codes", async () => {
    const combosRes = await authed("get", "/v1/combos");
    expect(combosRes.body.some((c: { name: string }) => c.name === "Margherita + Garlic Bread Combo")).toBe(true);

    const promosRes = await authed("get", "/v1/promotions");
    const codes = promosRes.body.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["WELCOME10", "FLAT50"]));
  });

  it("refuses to create a combo with the same variant listed twice", async () => {
    const res = await authed("post", "/v1/combos").send({
      brandId: paproniBrandId,
      name: `Bad Combo ${randomUUID().slice(0, 6)}`,
      comboPrice: "100.00",
      items: [
        { variantId: margheritaSmallVariantId, quantity: 1 },
        { variantId: margheritaSmallVariantId, quantity: 2 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("creates a combo with its component items in one call", async () => {
    const res = await authed("post", "/v1/combos").send({
      brandId: paproniBrandId,
      name: `Test Combo ${randomUUID().slice(0, 6)}`,
      comboPrice: "300.00",
      items: [
        { variantId: margheritaSmallVariantId, quantity: 1 },
        { variantId: garlicBreadVariantId, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    comboId = res.body.id;
  });

  it("adds the combo to a menu, and ordering it expands into per-component lines summing exactly to the bundle price", async () => {
    const addToMenuRes = await authed("post", `/v1/menus/${paproniDineInMenuId}/combo-items`).send({ comboId });
    expect(addToMenuRes.status).toBe(201);

    const orderRes = await authed("post", "/v1/orders").send({ outletId: paproniOutletId, channel: "DINE_IN" });
    comboOrderId = orderRes.body.id;

    const addComboRes = await authed("post", `/v1/orders/${comboOrderId}/combo-items`).send({ comboId, quantity: 1 });
    expect(addComboRes.status).toBe(201);

    const comboLines = addComboRes.body.items.filter((i: { comboId: string | null }) => i.comboId === comboId);
    expect(comboLines).toHaveLength(2);
    const comboInstanceId = comboLines[0].comboInstanceId;
    expect(comboLines.every((i: { comboInstanceId: string }) => i.comboInstanceId === comboInstanceId)).toBe(true);

    const sumOfLines = comboLines.reduce((sum: number, i: { lineSubtotal: string }) => sum + Number(i.lineSubtotal), 0);
    expect(sumOfLines).toBe(300); // exactly comboPrice × quantity, despite proportional rounding per line.
    expect(addComboRes.body.subtotal).toBe("300");
  });

  it("refuses to individually edit or void one line of a combo instance", async () => {
    const orderRes = await authed("get", `/v1/orders/${comboOrderId}`);
    const comboLine = orderRes.body.items.find((i: { comboId: string | null }) => i.comboId === comboId);

    const patchRes = await authed("patch", `/v1/orders/${comboOrderId}/items/${comboLine.id}`).send({ quantity: 2 });
    expect(patchRes.status).toBe(409);

    const deleteRes = await authed("delete", `/v1/orders/${comboOrderId}/items/${comboLine.id}`);
    expect(deleteRes.status).toBe(409);
  });

  it("voids the whole combo instance together, zeroing the order back out", async () => {
    const orderRes = await authed("get", `/v1/orders/${comboOrderId}`);
    const comboLine = orderRes.body.items.find((i: { comboId: string | null }) => i.comboId === comboId);
    const comboInstanceId = comboLine.comboInstanceId;

    const voidRes = await authed("delete", `/v1/orders/${comboOrderId}/combo-items/${comboInstanceId}`);
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.items.filter((i: { status: string }) => i.status === "ACTIVE")).toHaveLength(0);
    expect(voidRes.body.subtotal).toBe("0");
  });

  it("refuses to add a combo that is not on an active menu at the order's outlet", async () => {
    const orderRes = await authed("post", "/v1/orders").send({ outletId: oldMonkOutletId, channel: "DINE_IN" });
    const res = await authed("post", `/v1/orders/${orderRes.body.id}/combo-items`).send({ comboId, quantity: 1 });
    expect(res.status).toBe(404);
    await prisma.order.delete({ where: { id: orderRes.body.id } }).catch(() => undefined);
  });

  it("applies a FLAT promotion scoped to a brand, once its minimum subtotal is met", async () => {
    const orderRes = await authed("post", "/v1/orders").send({ outletId: oldMonkOutletId, channel: "DINE_IN" });
    flatPromoOrderId = orderRes.body.id;

    const tooSmallRes = await authed("post", `/v1/orders/${flatPromoOrderId}/promotion`).send({ code: "FLAT50" });
    expect(tooSmallRes.status).toBe(400); // subtotal is still 0, below the ₹200 minimum.

    await authed("post", `/v1/orders/${flatPromoOrderId}/items`).send({ variantId: sandwichVariantId, quantity: 2 });

    const applyRes = await authed("post", `/v1/orders/${flatPromoOrderId}/promotion`).send({ code: "FLAT50" });
    expect(applyRes.status).toBe(201);
    expect(applyRes.body.discountAmount).toBe("50");
    expect(Number(applyRes.body.total)).toBe(Number(applyRes.body.subtotal) + Number(applyRes.body.taxTotal) - 50);
  });

  it("refuses a brand-scoped promotion at an outlet of a different brand", async () => {
    const orderRes = await authed("post", "/v1/orders").send({ outletId: paproniOutletId, channel: "DINE_IN" });
    await authed("post", `/v1/orders/${orderRes.body.id}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });

    const res = await authed("post", `/v1/orders/${orderRes.body.id}/promotion`).send({ code: "FLAT50" });
    expect(res.status).toBe(409);
    await prisma.order.delete({ where: { id: orderRes.body.id } }).catch(() => undefined);
  });

  it("refuses to apply a second promotion once one is already active on the order", async () => {
    const res = await authed("post", `/v1/orders/${flatPromoOrderId}/promotion`).send({ code: "WELCOME10" });
    expect(res.status).toBe(409);
  });

  it("removes a promotion and un-counts its redemption, so the order's discount clears", async () => {
    const res = await authed("delete", `/v1/orders/${flatPromoOrderId}/promotion`);
    expect(res.status).toBe(200);
    expect(res.body.discountAmount).toBe("0");

    const removeAgainRes = await authed("delete", `/v1/orders/${flatPromoOrderId}/promotion`);
    expect(removeAgainRes.status).toBe(404);
  });

  it("enforces a promotion's usageLimit by counting redemptions, not just checking Order.promotionId", async () => {
    const limited = await prisma.promotion.create({
      data: { organizationId, code: `LIMITED-${randomUUID().slice(0, 6).toUpperCase()}`, type: "FLAT", value: "1.00", usageLimit: 1 },
    });
    limitedPromotionId = limited.id;

    const firstApplyRes = await authed("post", `/v1/orders/${flatPromoOrderId}/promotion`).send({ code: limited.code });
    expect(firstApplyRes.status).toBe(201);
    await authed("delete", `/v1/orders/${flatPromoOrderId}/promotion`); // un-apply, but the redemption still happened once

    // Re-seed a redemption directly to simulate a second order having used it, since this order's own
    // redemption was just removed above (removal un-counts it by design).
    await prisma.promotionRedemption.create({
      data: { organizationId, orderId: flatPromoOrderId, promotionId: limited.id, discountAmount: "1.00" },
    });

    const secondOrderRes = await authed("post", "/v1/orders").send({ outletId: oldMonkOutletId, channel: "DINE_IN" });
    const secondApplyRes = await authed("post", `/v1/orders/${secondOrderRes.body.id}/promotion`).send({ code: limited.code });
    expect(secondApplyRes.status).toBe(409);
    await prisma.order.delete({ where: { id: secondOrderRes.body.id } }).catch(() => undefined);
  });

  it("never lets a combo or promotion from another organization be read or applied", async () => {
    const comboRes = await authed("get", `/v1/combos/${otherComboId}`);
    expect(comboRes.status).toBe(404);

    const applyRes = await authed("post", `/v1/orders/${flatPromoOrderId}/promotion`).send({ code: "RIVALCODE" });
    expect(applyRes.status).toBe(404);

    void otherPromotionId; // referenced only to document the fixture; the code lookup above is what's under test.
  });
});
