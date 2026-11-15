import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Loyalty & Rewards (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let margheritaMediumVariantId: string;
  let testOutletId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let referrerCustomerId: string;
  let refereeCustomerId: string;
  let walletCustomerId: string;
  let tierId: string;
  let otherOrgId: string;
  let otherCustomerId: string;
  let otherBrandId: string;
  const orderIds: string[] = [];

  function authed(method: "get" | "post" | "patch" | "put" | "delete", path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Organization-Id", organizationId);
  }

  async function createPaidOrder(customerId: string, redeemPoints?: number) {
    const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId });
    const orderId = orderRes.body.id;
    orderIds.push(orderId);
    await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });
    // Margherita Medium: 349.00 + 18% GST = 411.82.
    let total = "411.82";
    if (redeemPoints) {
      const redeemRes = await authed("post", `/v1/orders/${orderId}/loyalty-redemption`).send({ points: redeemPoints });
      total = redeemRes.body.total;
    }
    const payRes = await authed("post", `/v1/orders/${orderId}/payments`).send({ method: "CARD", amount: total });
    return payRes.body;
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
      name: "Paproni - Loyalty Test",
      code: "PP-LOY-01",
    });
    testOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: testOutletId });

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-loyalty-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand-loyalty" },
    });
    otherBrandId = otherBrand.id;
    const otherCustomer = await prisma.customer.create({
      data: { organizationId: otherOrgId, name: "Rival Customer", phone: "+91-9444444444" },
    });
    otherCustomerId = otherCustomer.id;
  });

  afterAll(async () => {
    for (const orderId of orderIds) {
      await prisma.loyaltyTransaction.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    }
    if (tierId) await prisma.loyaltyTier.delete({ where: { id: tierId } }).catch(() => undefined);
    for (const id of [referrerCustomerId, refereeCustomerId, walletCustomerId]) {
      if (id) {
        await prisma.loyaltyTransaction.deleteMany({ where: { customerId: id } }).catch(() => undefined);
        await prisma.customer.delete({ where: { id } }).catch(() => undefined);
      }
    }
    if (testOutletId) await prisma.outlet.delete({ where: { id: testOutletId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    for (const path of ["/v1/loyalty/settings", "/v1/loyalty/tiers"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });

  describe("settings", () => {
    it("returns the program settings, and a no-op patch round-trips the same value", async () => {
      const getRes = await authed("get", "/v1/loyalty/settings");
      expect(getRes.status).toBe(200);
      const currentReferralBonus = getRes.body.referralBonusPoints;

      const patchRes = await authed("patch", "/v1/loyalty/settings").send({ referralBonusPoints: currentReferralBonus });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.referralBonusPoints).toBe(currentReferralBonus);
    });
  });

  describe("tiers", () => {
    it("creates a tier and refuses a duplicate name", async () => {
      const name = `E2E Tier ${randomUUID().slice(0, 8)}`;
      const createRes = await authed("post", "/v1/loyalty/tiers").send({ name, minLifetimePoints: 10000, earningMultiplier: "3" });
      expect(createRes.status).toBe(201);
      tierId = createRes.body.id;

      const dupRes = await authed("post", "/v1/loyalty/tiers").send({ name, minLifetimePoints: 1, earningMultiplier: "1" });
      expect(dupRes.status).toBe(409);

      const listRes = await authed("get", "/v1/loyalty/tiers");
      expect(listRes.body.some((t: { id: string }) => t.id === tierId)).toBe(true);
    });

    it("updates a tier", async () => {
      const res = await authed("patch", `/v1/loyalty/tiers/${tierId}`).send({ sortOrder: 99 });
      expect(res.status).toBe(200);
      expect(res.body.sortOrder).toBe(99);
    });
  });

  describe("brand rules", () => {
    it("404s when the brand belongs to another organization", async () => {
      const res = await authed("put", `/v1/loyalty/brand-rules/${otherBrandId}`).send({ earningRate: "2" });
      expect(res.status).toBe(404);
    });

    it("upserts a brand-specific rate override", async () => {
      const res = await authed("put", `/v1/loyalty/brand-rules/${paproniBrandId}`).send({ earningRate: "2", redemptionRatio: "1" });
      expect(res.status).toBe(200);
      expect(res.body.earningRate).toBe("2");

      const getRes = await authed("get", `/v1/loyalty/brand-rules/${paproniBrandId}`);
      expect(getRes.body.earningRate).toBe("2");

      // Reset back to "use the organization default" so the rest of this suite (and any other
      // spec that pays a Pizza Paproni order) isn't affected by a leftover 2x earning rate.
      await authed("put", `/v1/loyalty/brand-rules/${paproniBrandId}`).send({ earningRate: null, redemptionRatio: null });
    });
  });

  describe("welcome bonus", () => {
    it("credits the configured welcome bonus the moment a customer is created", async () => {
      const createRes = await authed("post", "/v1/customers").send({
        name: "Loyalty Wallet Test",
        phone: `+91-92${randomUUID().slice(0, 8)}`,
      });
      walletCustomerId = createRes.body.id;

      const walletRes = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(walletRes.body.balance).toBe(20);
      expect(walletRes.body.lifetimePoints).toBe(20);
      expect(walletRes.body.tier?.name).toBe("Silver");

      const txRes = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/transactions`);
      expect(txRes.body[0]).toEqual(expect.objectContaining({ type: "WELCOME_BONUS", points: 20 }));
    });

    it("404s for a customer from another organization", async () => {
      const res = await authed("get", `/v1/customers/${otherCustomerId}/loyalty/wallet`);
      expect(res.status).toBe(404);
    });
  });

  describe("earning on payment", () => {
    it("earns points (1 per ₹100, floored) only once the order is fully paid, added to the welcome balance", async () => {
      const paid = await createPaidOrder(walletCustomerId);
      expect(paid.status).toBe("PAID");

      // welcome bonus 20 + floor(411.82/100 * earningRate 1 * Silver multiplier 1) = 20 + 4 = 24.
      const walletRes = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(walletRes.body.balance).toBe(24);
      expect(walletRes.body.lifetimePoints).toBe(24);
    });
  });

  describe("redemption", () => {
    it("applies a discount, debits the balance immediately, and refuses a second redemption on the same order", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId: walletCustomerId });
      const orderId = orderRes.body.id;
      orderIds.push(orderId);
      await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });

      const redeemRes = await authed("post", `/v1/orders/${orderId}/loyalty-redemption`).send({ points: 10 });
      expect(redeemRes.status).toBe(201);
      expect(redeemRes.body.loyaltyPointsRedeemed).toBe(10);
      expect(redeemRes.body.total).toBe("401.82"); // 411.82 - ₹10 (redemptionRatio 1).

      const walletAfterRedeem = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(walletAfterRedeem.body.balance).toBe(14); // 24 - 10.

      const dupRes = await authed("post", `/v1/orders/${orderId}/loyalty-redemption`).send({ points: 5 });
      expect(dupRes.status).toBe(409);

      const payRes = await authed("post", `/v1/orders/${orderId}/payments`).send({ method: "CASH", amount: "401.82" });
      expect(payRes.body.status).toBe("PAID");

      // Earns floor(401.82/100 * 1 * 1) = 4 on top of the 14 remaining after redemption -> 18.
      const finalWallet = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(finalWallet.body.balance).toBe(18);
    });

    it("refuses to redeem more points than the customer's current balance", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId: walletCustomerId });
      orderIds.push(orderRes.body.id);
      const res = await authed("post", `/v1/orders/${orderRes.body.id}/loyalty-redemption`).send({ points: 999999 });
      expect(res.status).toBe(409);
    });

    it("removing a redemption credits the points back and restores the order total", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId: walletCustomerId });
      const orderId = orderRes.body.id;
      orderIds.push(orderId);
      await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });

      const beforeWallet = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      await authed("post", `/v1/orders/${orderId}/loyalty-redemption`).send({ points: 5 });

      const removeRes = await authed("delete", `/v1/orders/${orderId}/loyalty-redemption`);
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.loyaltyPointsRedeemed).toBe(0);
      expect(removeRes.body.total).toBe("411.82");

      const afterWallet = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(afterWallet.body.balance).toBe(beforeWallet.body.balance);

      const secondRemoveRes = await authed("delete", `/v1/orders/${orderId}/loyalty-redemption`);
      expect(secondRemoveRes.status).toBe(404);
    });

    it("voiding an order with an active redemption reverses it", async () => {
      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId: walletCustomerId });
      const orderId = orderRes.body.id;
      orderIds.push(orderId);
      await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });

      const beforeWallet = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      await authed("post", `/v1/orders/${orderId}/loyalty-redemption`).send({ points: 5 });

      const voidRes = await authed("post", `/v1/orders/${orderId}/void`);
      expect(voidRes.status).toBe(200);
      expect(voidRes.body.status).toBe("VOIDED");

      const afterWallet = await authed("get", `/v1/customers/${walletCustomerId}/loyalty/wallet`);
      expect(afterWallet.body.balance).toBe(beforeWallet.body.balance);
    });
  });

  describe("manual adjustment", () => {
    it("credits a positive adjustment and rejects a negative one that would go below zero", async () => {
      const creditRes = await authed("post", `/v1/customers/${walletCustomerId}/loyalty/adjustments`).send({
        points: 100,
        note: "Goodwill gesture",
      });
      expect(creditRes.status).toBe(201);
      expect(creditRes.body.type).toBe("MANUAL_ADJUSTMENT");

      const overDraftRes = await authed("post", `/v1/customers/${walletCustomerId}/loyalty/adjustments`).send({
        points: -999999,
        note: "too much",
      });
      expect(overDraftRes.status).toBe(409);
    });
  });

  describe("referral bonus", () => {
    it("credits the referrer exactly once the referee's order is first paid, never again on a second order", async () => {
      const referrerRes = await authed("post", "/v1/customers").send({ name: "Referrer", phone: `+91-93${randomUUID().slice(0, 8)}` });
      referrerCustomerId = referrerRes.body.id;

      const refereeRes = await authed("post", "/v1/customers").send({
        name: "Referee",
        phone: `+91-94${randomUUID().slice(0, 8)}`,
        referredByCustomerId: referrerCustomerId,
      });
      refereeCustomerId = refereeRes.body.id;

      const referrerBefore = await authed("get", `/v1/customers/${referrerCustomerId}/loyalty/wallet`);

      await createPaidOrder(refereeCustomerId);
      const referrerAfterFirst = await authed("get", `/v1/customers/${referrerCustomerId}/loyalty/wallet`);
      expect(referrerAfterFirst.body.balance).toBe(referrerBefore.body.balance + 50);

      await createPaidOrder(refereeCustomerId);
      const referrerAfterSecond = await authed("get", `/v1/customers/${referrerCustomerId}/loyalty/wallet`);
      expect(referrerAfterSecond.body.balance).toBe(referrerAfterFirst.body.balance); // unchanged — one-time only.
    });

    it("404s creating a customer whose referrer belongs to another organization", async () => {
      const res = await authed("post", "/v1/customers").send({
        name: "Bad Referral",
        phone: `+91-95${randomUUID().slice(0, 8)}`,
        referredByCustomerId: otherCustomerId,
      });
      expect(res.status).toBe(404);
    });
  });
});
