import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

jest.setTimeout(30_000);

describe("Dynamic Pricing Engine (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let categoryId: string;
  let taxCategoryId: string;
  let testOutletId: string;

  let otherOrgId: string;
  let otherBrandId: string;
  let otherOutletId: string;

  let plainVariantId: string;
  let discountedVariantId: string;
  let discountRuleId: string;
  let retailVariantId: string;
  let costedVariantId: string;
  const productIds: string[] = [];

  const pricingRuleIds: string[] = [];
  const orderIds: string[] = [];

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

    const brandsRes = await authed("get", "/v1/brands");
    paproniBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "pizza-paproni").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const categoriesRes = await authed("get", `/v1/product-categories?brandId=${paproniBrandId}`);
    categoryId = categoriesRes.body.find((c: { name: string }) => c.name === "Sides").id;

    const taxCategoriesRes = await authed("get", "/v1/tax-categories");
    taxCategoryId = taxCategoriesRes.body.find((t: { name: string }) => t.name === "GST 18%").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - Pricing Test",
      code: "PP-PRICE-01",
    });
    testOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: testOutletId });

    const plainRes = await authed("post", "/v1/products").send({
      brandId: paproniBrandId,
      categoryId,
      taxCategoryId,
      name: `E2E Pricing Widget ${randomUUID().slice(0, 8)}`,
      sku: `E2E-W-${randomUUID().slice(0, 8)}`,
      variants: [{ name: "Regular", sku: `E2E-W-REG-${randomUUID().slice(0, 8)}`, basePrice: "50.00" }],
    });
    plainVariantId = plainRes.body.variants[0].id;
    productIds.push(plainRes.body.id);
    await authed("post", `/v1/menus/${paproniDineInMenuId}/items`).send({ variantId: plainVariantId });

    const discountedRes = await authed("post", "/v1/products").send({
      brandId: paproniBrandId,
      categoryId,
      taxCategoryId,
      name: `E2E Discounted Widget ${randomUUID().slice(0, 8)}`,
      sku: `E2E-D-${randomUUID().slice(0, 8)}`,
      variants: [{ name: "Regular", sku: `E2E-D-REG-${randomUUID().slice(0, 8)}`, basePrice: "50.00" }],
    });
    discountedVariantId = discountedRes.body.variants[0].id;
    productIds.push(discountedRes.body.id);
    await authed("post", `/v1/menus/${paproniDineInMenuId}/items`).send({ variantId: discountedVariantId });

    const discountRuleRes = await authed("post", "/v1/pricing/rules").send({
      variantId: discountedVariantId,
      category: "SCHEDULED_DISCOUNT",
      label: `E2E always-on discount ${randomUUID().slice(0, 8)}`,
      adjustmentType: "FLAT_DISCOUNT",
      adjustmentValue: "5.00",
    });
    discountRuleId = discountRuleRes.body.id;
    pricingRuleIds.push(discountRuleId);

    const retailRes = await authed("post", "/v1/products").send({
      brandId: paproniBrandId,
      categoryId,
      taxCategoryId,
      name: `E2E Retail Widget ${randomUUID().slice(0, 8)}`,
      sku: `E2E-R-${randomUUID().slice(0, 8)}`,
      variants: [
        {
          name: "Regular",
          sku: `E2E-R-REG-${randomUUID().slice(0, 8)}`,
          basePrice: "100.00",
          kind: "RETAIL_COMMODITY",
          printedMRP: "105.00",
        },
      ],
    });
    retailVariantId = retailRes.body.variants[0].id;
    productIds.push(retailRes.body.id);

    const costedRes = await authed("post", "/v1/products").send({
      brandId: paproniBrandId,
      categoryId,
      taxCategoryId,
      name: `E2E Costed Widget ${randomUUID().slice(0, 8)}`,
      sku: `E2E-C-${randomUUID().slice(0, 8)}`,
      variants: [
        {
          name: "Regular",
          sku: `E2E-C-REG-${randomUUID().slice(0, 8)}`,
          basePrice: "100.00",
          kind: "RETAIL_COMMODITY",
          landedCost: "50.00",
        },
      ],
    });
    costedVariantId = costedRes.body.variants[0].id;
    productIds.push(costedRes.body.id);

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-pricing-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand-pricing" },
    });
    otherBrandId = otherBrand.id;
    const otherOutlet = await prisma.outlet.create({
      data: { organizationId: otherOrgId, brandId: otherBrandId, name: "Rival Outlet", code: "RIVAL-01" },
    });
    otherOutletId = otherOutlet.id;
  });

  afterAll(async () => {
    for (const orderId of orderIds) {
      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    }
    for (const id of pricingRuleIds) {
      await prisma.pricingRule.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.outletProductPrice.deleteMany({ where: { outletId: testOutletId } }).catch(() => undefined);
    for (const id of productIds) {
      await prisma.product.delete({ where: { id } }).catch(() => undefined);
    }
    if (testOutletId) await prisma.outlet.delete({ where: { id: testOutletId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    for (const path of ["/v1/pricing/settings", "/v1/pricing/rules", "/v1/pricing/quote"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });

  describe("settings", () => {
    it("returns default settings, and a round-trip update is reflected and then reset", async () => {
      const getRes = await authed("get", "/v1/pricing/settings");
      expect(getRes.status).toBe(200);

      const patchRes = await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "12.50" });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.minimumMarginPercent).toBe("12.5");

      // Reset to the schema's true default (0), not whatever value a prior failed run may
      // have left behind — a nonzero margin floor would otherwise perturb every other quote
      // test below, for the remainder of this suite and every run after it.
      await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "0" });
      const afterReset = await authed("get", "/v1/pricing/settings");
      expect(afterReset.body.minimumMarginPercent).toBe("0");
    });
  });

  describe("margin safeguard (Prompt 19)", () => {
    const createdRuleIds: string[] = [];

    afterAll(async () => {
      for (const id of createdRuleIds) {
        await prisma.pricingRule.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it("rejects a discount that would price the variant below the minimum profitable price", async () => {
      await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "20" });

      // basePrice 100, landedCost 50 -> floor = 50 / 0.8 = 62.5. A flat discount of 40 prices
      // it at 60, below that.
      const res = await authed("post", "/v1/pricing/rules").send({
        variantId: costedVariantId,
        category: "SCHEDULED_DISCOUNT",
        label: `E2E unsafe discount ${randomUUID().slice(0, 8)}`,
        adjustmentType: "FLAT_DISCOUNT",
        adjustmentValue: "40.00",
      });
      expect(res.status).toBe(409);

      await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "0" });
    });

    it("allows the same discount once approvedOverride is set, and the recommendations endpoint agrees on the floor", async () => {
      await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "20" });

      const res = await authed("post", "/v1/pricing/rules").send({
        variantId: costedVariantId,
        category: "SCHEDULED_DISCOUNT",
        label: `E2E unsafe discount, approved ${randomUUID().slice(0, 8)}`,
        adjustmentType: "FLAT_DISCOUNT",
        adjustmentValue: "40.00",
        approvedOverride: true,
      });
      expect(res.status).toBe(201);
      createdRuleIds.push(res.body.id);

      const minPriceRes = await authed("get", `/v1/promotions/recommendations/minimum-price/${costedVariantId}`);
      expect(minPriceRes.status).toBe(200);
      expect(minPriceRes.body.minimumProfitablePrice).toBe("62.5");

      await authed("patch", "/v1/pricing/settings").send({ minimumMarginPercent: "0" });
    });
  });

  describe("rules", () => {
    it("404s when the variant belongs to another organization", async () => {
      const res = await authed("post", "/v1/pricing/rules").send({
        variantId: "nonexistent-cross-org-variant",
        category: "CHANNEL",
        label: "Should fail",
        adjustmentType: "FLAT_DISCOUNT",
        adjustmentValue: "1.00",
      });
      expect(res.status).toBe(404);
    });

    it("404s when the outlet belongs to another organization", async () => {
      const res = await authed("post", "/v1/pricing/rules").send({
        outletId: otherOutletId,
        category: "OUTLET",
        label: "Should fail",
        adjustmentType: "FLAT_DISCOUNT",
        adjustmentValue: "1.00",
      });
      expect(res.status).toBe(404);
    });

    it("lists the created discount rule and can update it", async () => {
      const listRes = await authed("get", "/v1/pricing/rules");
      expect(listRes.body.some((r: { id: string }) => r.id === discountRuleId)).toBe(true);

      const patchRes = await authed("patch", `/v1/pricing/rules/${discountRuleId}`).send({ priority: 5 });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.priority).toBe(5);
    });
  });

  describe("quote", () => {
    it("quotes the plain base price with no rule and no override", async () => {
      const res = await authed(
        "get",
        `/v1/pricing/quote?variantId=${plainVariantId}&outletId=${testOutletId}&channel=DINE_IN`,
      );
      expect(res.status).toBe(200);
      expect(res.body.finalPrice).toBe("50");
      expect(res.body.selectedRule).toBeNull();
    });

    it("resolves from an outlet override before any rule", async () => {
      await authed("put", `/v1/pricing/outlets/${testOutletId}/variants/${plainVariantId}`).send({ price: "60.00" });

      const res = await authed(
        "get",
        `/v1/pricing/quote?variantId=${plainVariantId}&outletId=${testOutletId}&channel=DINE_IN`,
      );
      expect(res.body.finalPrice).toBe("60");
      expect(res.body.breakdown.outletOverride).toBe("60");

      await authed("delete", `/v1/pricing/outlets/${testOutletId}/variants/${plainVariantId}`);
    });

    it("applies the matching rule and returns it as the selected rule with a breakdown", async () => {
      const res = await authed(
        "get",
        `/v1/pricing/quote?variantId=${discountedVariantId}&outletId=${testOutletId}&channel=DINE_IN`,
      );
      expect(res.status).toBe(200);
      expect(res.body.finalPrice).toBe("45");
      expect(res.body.selectedRule.id).toBe(discountRuleId);
      expect(res.body.breakdown.basePrice).toBe("50");
    });

    it("never quotes a retail commodity above its printed MRP, even with no discount applied", async () => {
      const surchargeRuleRes = await authed("post", "/v1/pricing/rules").send({
        variantId: retailVariantId,
        category: "FESTIVAL",
        label: `E2E MRP test surcharge ${randomUUID().slice(0, 8)}`,
        adjustmentType: "PERCENT_SURCHARGE",
        adjustmentValue: "50.00",
      });
      pricingRuleIds.push(surchargeRuleRes.body.id);

      const res = await authed(
        "get",
        `/v1/pricing/quote?variantId=${retailVariantId}&outletId=${testOutletId}&channel=DINE_IN`,
      );
      expect(res.body.finalPrice).toBe("105"); // 100 + 50% = 150, capped at the printed MRP of 105.
      expect(res.body.breakdown.mrpCapped).toBe(true);
    });
  });

  describe("order integration", () => {
    it("locks the rule-adjusted price onto the order item, and never rewrites it after the rule is deactivated", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN" });
      const orderId = orderRes.body.id;
      orderIds.push(orderId);

      const addRes = await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: discountedVariantId, quantity: 1 });
      expect(addRes.status).toBe(201);
      const item = addRes.body.items.find((i: { variantId: string }) => i.variantId === discountedVariantId);
      expect(item.unitPrice).toBe("45");
      expect(item.pricingRuleId).toBe(discountRuleId);

      // Deactivate the rule after the fact — the already-added line must not change.
      await authed("patch", `/v1/pricing/rules/${discountRuleId}`).send({ isActive: false });

      const afterRes = await authed("get", `/v1/orders/${orderId}`);
      const unchangedItem = afterRes.body.items.find((i: { variantId: string }) => i.variantId === discountedVariantId);
      expect(unchangedItem.unitPrice).toBe("45");

      // A fresh quote for a new line, by contrast, now sees the deactivated rule and prices
      // from the plain base instead.
      const freshQuoteRes = await authed(
        "get",
        `/v1/pricing/quote?variantId=${discountedVariantId}&outletId=${testOutletId}&channel=DINE_IN`,
      );
      expect(freshQuoteRes.body.finalPrice).toBe("50");

      await authed("patch", `/v1/pricing/rules/${discountRuleId}`).send({ isActive: true });
    });
  });
});
