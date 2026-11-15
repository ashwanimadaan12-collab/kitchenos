import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

// Heavier setup than most e2e suites (3 full order-creation flows plus template/segment/consent
// calls in beforeAll) — the default 5s Jest timeout is too tight under parallel suite load.
jest.setTimeout(30_000);

describe("Campaigns (WhatsApp marketing automation) (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let bakeryBrandId: string;
  let bountyOutletId: string;
  let croissantVariantId: string;
  let orderConfirmationTemplateId: string;
  let blastTemplateId: string;

  let otherOrgId: string;
  let otherBrandId: string;
  let otherLoyaltyTierId: string;

  let segmentId: string;
  let custConsentedAId: string;
  let custConsentedBId: string;
  let custNoConsentId: string;

  const campaignIds: string[] = [];
  const orderIds: string[] = [];

  function authed(method: "get" | "post" | "patch" | "put" | "delete", path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Organization-Id", organizationId);
  }

  // Places a real PAID croissant order at the dedicated Bounty Bakery outlet for the given
  // customer — the same "most-ordered brand" signal the BRAND_PREFERENCE segment reads.
  async function placeBountyOrder(customerId: string) {
    const orderRes = await authed("post", "/v1/orders").send({ outletId: bountyOutletId, channel: "DINE_IN", customerId });
    const orderId = orderRes.body.id;
    orderIds.push(orderId);
    await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: croissantVariantId, quantity: 1 });
    const orderDetail = await authed("get", `/v1/orders/${orderId}`);
    const total = orderDetail.body.total;
    const payRes = await authed("post", `/v1/orders/${orderId}/payments`).send({ method: "CASH", amount: total });
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
    bakeryBrandId = brandsRes.body.find((b: { slug: string }) => b.slug === "bounty-bakery").id;

    const outletsRes = await authed("get", "/v1/outlets");
    bountyOutletId = outletsRes.body.find((o: { code: string }) => o.code === "BB-MG-01").id;

    const productsRes = await authed("get", `/v1/products?brandId=${bakeryBrandId}`);
    const croissant = productsRes.body.find((p: { sku: string }) => p.sku === "BB-CROISSANT");
    croissantVariantId = croissant.variants.find((v: { name: string }) => v.name === "Regular").id;

    const templatesRes = await authed("get", "/v1/communication-templates");
    orderConfirmationTemplateId = templatesRes.body.find(
      (t: { key: string; channel: string }) => t.key === "order_confirmation" && t.channel === "WHATSAPP",
    ).id;

    const blastKey = `e2e_campaign_blast_${randomUUID().slice(0, 8)}`;
    const blastRes = await authed("post", "/v1/communication-templates").send({
      channel: "WHATSAPP",
      purpose: "PROMOTIONAL",
      key: blastKey,
      name: "E2E Campaign Blast",
      body: "Hi! Check out our latest offer.",
    });
    blastTemplateId = blastRes.body.id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-campaigns-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherBrand = await prisma.brand.create({
      data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand-campaigns" },
    });
    otherBrandId = otherBrand.id;
    const otherLoyaltyTier = await prisma.loyaltyTier.create({
      data: { organizationId: otherOrgId, name: "Rival Tier", minLifetimePoints: 0, sortOrder: 0 },
    });
    otherLoyaltyTierId = otherLoyaltyTier.id;

    const segmentRes = await authed("post", "/v1/customer-segments").send({
      name: `E2E Bounty Preference ${randomUUID().slice(0, 8)}`,
      type: "BRAND_PREFERENCE",
      brandId: bakeryBrandId,
    });
    segmentId = segmentRes.body.id;

    const custA = await authed("post", "/v1/customers").send({ name: "Campaign Consented A", phone: `+91-96${randomUUID().slice(0, 8)}` });
    custConsentedAId = custA.body.id;
    const custB = await authed("post", "/v1/customers").send({ name: "Campaign Consented B", phone: `+91-97${randomUUID().slice(0, 8)}` });
    custConsentedBId = custB.body.id;
    const custC = await authed("post", "/v1/customers").send({ name: "Campaign No Consent", phone: `+91-98${randomUUID().slice(0, 8)}` });
    custNoConsentId = custC.body.id;

    await placeBountyOrder(custConsentedAId);
    await placeBountyOrder(custConsentedBId);
    await placeBountyOrder(custNoConsentId);

    await authed("post", `/v1/customers/${custConsentedAId}/communication-preferences/WHATSAPP/consent`).send({ source: "e2e-test" });
    await authed("post", `/v1/customers/${custConsentedBId}/communication-preferences/WHATSAPP/consent`).send({ source: "e2e-test" });
  });

  afterAll(async () => {
    for (const campaignId of campaignIds) {
      await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => undefined);
    }
    await prisma.communicationTemplate.delete({ where: { id: blastTemplateId } }).catch(() => undefined);
    for (const orderId of orderIds) {
      await prisma.loyaltyTransaction.deleteMany({ where: { orderId } }).catch(() => undefined);
      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    }
    const customerIds = [custConsentedAId, custConsentedBId, custNoConsentId];
    await prisma.communicationMessage.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => undefined);
    await prisma.customerCommunicationPreference.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => undefined);
    await prisma.loyaltyTransaction.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => undefined);
    if (segmentId) await prisma.customerSegment.delete({ where: { id: segmentId } }).catch(() => undefined);
    for (const id of customerIds) {
      if (id) await prisma.customer.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    for (const path of ["/v1/customer-segments", "/v1/campaigns"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });

  describe("customer segments", () => {
    it("404s for BRAND_PREFERENCE when the brand belongs to another organization", async () => {
      const res = await authed("post", "/v1/customer-segments").send({
        name: `Should fail ${randomUUID()}`,
        type: "BRAND_PREFERENCE",
        brandId: otherBrandId,
      });
      expect(res.status).toBe(404);
    });

    it("404s for LOYALTY_TIER when the tier belongs to another organization", async () => {
      const res = await authed("post", "/v1/customer-segments").send({
        name: `Should fail ${randomUUID()}`,
        type: "LOYALTY_TIER",
        loyaltyTierId: otherLoyaltyTierId,
      });
      expect(res.status).toBe(404);
    });

    it("refuses a duplicate segment name within the same organization", async () => {
      const res = await authed("get", `/v1/customer-segments/${segmentId}`);
      const dupRes = await authed("post", "/v1/customer-segments").send({ name: res.body.name, type: "ALL" });
      expect(dupRes.status).toBe(409);
    });

    it("lists the created segment", async () => {
      const res = await authed("get", "/v1/customer-segments");
      expect(res.body.some((s: { id: string }) => s.id === segmentId)).toBe(true);
    });

    it("previews the segment's resolved customers, including our three dedicated test customers", async () => {
      const res = await authed("get", `/v1/customer-segments/${segmentId}/customers`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(res.body.customerIds.length);
      expect(res.body.customerIds).toEqual(
        expect.arrayContaining([custConsentedAId, custConsentedBId, custNoConsentId]),
      );
    });

    it("updates the segment's name", async () => {
      const newName = `E2E Bounty Preference Renamed ${randomUUID().slice(0, 8)}`;
      const res = await authed("patch", `/v1/customer-segments/${segmentId}`).send({ name: newName });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(newName);
    });
  });

  describe("campaign creation", () => {
    it("404s when the segment belongs to another organization-scoped check (nonexistent id)", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId: "nonexistent-segment-id",
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 100 }],
      });
      expect(res.status).toBe(404);
    });

    it("404s when a variant's template is not an active WhatsApp promotional template", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId,
        variants: [{ name: "A", templateId: orderConfirmationTemplateId, trafficPercent: 100 }],
      });
      expect(res.status).toBe(404);
    });

    it("400s when variant trafficPercent values don't sum to 100", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId,
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 50 }],
      });
      expect(res.status).toBe(400);
    });

    it("400s on duplicate variant names", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId,
        variants: [
          { name: "A", templateId: blastTemplateId, trafficPercent: 50 },
          { name: "A", templateId: blastTemplateId, trafficPercent: 50 },
        ],
      });
      expect(res.status).toBe(400);
    });

    it("creates a DRAFT campaign with no scheduledFor, and a SCHEDULED one with a future scheduledFor", async () => {
      const draftRes = await authed("post", "/v1/campaigns").send({
        name: `E2E Draft ${randomUUID().slice(0, 8)}`,
        type: "CUSTOM",
        segmentId,
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 100 }],
      });
      expect(draftRes.status).toBe(201);
      expect(draftRes.body.status).toBe("DRAFT");
      campaignIds.push(draftRes.body.id);

      const scheduledRes = await authed("post", "/v1/campaigns").send({
        name: `E2E Scheduled ${randomUUID().slice(0, 8)}`,
        type: "CUSTOM",
        segmentId,
        scheduledFor: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 100 }],
      });
      expect(scheduledRes.status).toBe(201);
      expect(scheduledRes.body.status).toBe("SCHEDULED");
      campaignIds.push(scheduledRes.body.id);

      const cancelRes = await authed("post", `/v1/campaigns/${scheduledRes.body.id}/cancel`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe("CANCELLED");

      const redispatchRes = await authed("post", `/v1/campaigns/${cancelRes.body.id}/dispatch`);
      expect(redispatchRes.status).toBe(409);
    });
  });

  describe("dispatch and stats", () => {
    let mainCampaignId: string;

    it("dispatches to every resolved customer, respecting consent, and computes stats on demand", async () => {
      const createRes = await authed("post", "/v1/campaigns").send({
        name: `E2E Main Blast ${randomUUID().slice(0, 8)}`,
        type: "CUSTOM",
        segmentId,
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 100 }],
      });
      mainCampaignId = createRes.body.id;
      campaignIds.push(mainCampaignId);

      const dispatchRes = await authed("post", `/v1/campaigns/${mainCampaignId}/dispatch`);
      expect(dispatchRes.status).toBe(200);
      expect(dispatchRes.body.status).toBe("COMPLETED");

      const statsRes = await authed("get", `/v1/campaigns/${mainCampaignId}/stats`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.targeted).toBe(3);
      expect(statsRes.body.sent).toBe(2); // the two consented customers — a message was attempted.
      expect(statsRes.body.skipped).toBe(1); // the non-consented customer — never sent, consent-gated.
      expect(statsRes.body.delivered).toBe(0); // no real WhatsApp provider credentials in this environment.
      expect(statsRes.body.converted).toBe(0);
    });

    it("409s re-dispatching an already-completed campaign", async () => {
      const res = await authed("post", `/v1/campaigns/${mainCampaignId}/dispatch`);
      expect(res.status).toBe(409);
    });

    it("exhausts the budget partway through the segment, skipping the remainder with a clear reason", async () => {
      const createRes = await authed("post", "/v1/campaigns").send({
        name: `E2E Budget Capped ${randomUUID().slice(0, 8)}`,
        type: "CUSTOM",
        segmentId,
        budgetAmount: "1.00", // costPerMessage defaults to 0.5 -> exactly 2 of the 3 resolved customers fit.
        variants: [{ name: "A", templateId: blastTemplateId, trafficPercent: 100 }],
      });
      const budgetCampaignId = createRes.body.id;
      campaignIds.push(budgetCampaignId);

      await authed("post", `/v1/campaigns/${budgetCampaignId}/dispatch`);

      const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: budgetCampaignId } });
      expect(recipients).toHaveLength(3);
      expect(recipients.filter((r) => r.skippedReason === "Campaign budget exhausted")).toHaveLength(1);
      expect(recipients.filter((r) => r.messageId !== null)).toHaveLength(2);
    });

    it("attributes a subsequent paid order's revenue to the most recent delivered send, within the conversion window", async () => {
      const recipient = await prisma.campaignRecipient.findFirstOrThrow({
        where: { campaignId: mainCampaignId, customerId: custConsentedAId },
      });
      expect(recipient.messageId).not.toBeNull();
      // Simulates a real WhatsApp provider reporting successful delivery — this environment has
      // no provider credentials configured, so a real send can never actually reach DELIVERED.
      await prisma.communicationMessage.update({ where: { id: recipient.messageId as string }, data: { status: "DELIVERED" } });

      const paid = await placeBountyOrder(custConsentedAId);
      expect(paid.status).toBe("PAID");

      const statsRes = await authed("get", `/v1/campaigns/${mainCampaignId}/stats`);
      expect(statsRes.body.converted).toBe(1);
      expect(statsRes.body.revenueAttributed).toBe(paid.total);

      const updatedRecipient = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      expect(updatedRecipient.convertedOrderId).toBe(paid.id);
    });
  });

  describe("controlled experiments (Prompt 19)", () => {
    it("404s creating a campaign whose variant omits templateId without isControl", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId,
        variants: [{ name: "A", trafficPercent: 100 }],
      });
      expect(res.status).toBe(400);
    });

    it("refuses more than one control-group variant on the same campaign", async () => {
      const res = await authed("post", "/v1/campaigns").send({
        name: "Should fail",
        type: "CUSTOM",
        segmentId,
        variants: [
          { name: "Control A", trafficPercent: 50, isControl: true },
          { name: "Control B", trafficPercent: 50, isControl: true },
        ],
      });
      expect(res.status).toBe(400);
    });

    it("never sends to the control group, and reports each treatment variant's lift over it", async () => {
      const createRes = await authed("post", "/v1/campaigns").send({
        name: `E2E Experiment ${randomUUID().slice(0, 8)}`,
        type: "CUSTOM",
        segmentId,
        variants: [
          { name: "Promo", templateId: blastTemplateId, trafficPercent: 50 },
          { name: "Control", trafficPercent: 50, isControl: true },
        ],
      });
      expect(createRes.status).toBe(201);
      const experimentCampaignId = createRes.body.id;
      campaignIds.push(experimentCampaignId);
      const controlVariant = createRes.body.variants.find((v: { isControl: boolean }) => v.isControl);
      expect(controlVariant.templateId).toBeNull();

      const dispatchRes = await authed("post", `/v1/campaigns/${experimentCampaignId}/dispatch`);
      expect(dispatchRes.status).toBe(200);

      const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: experimentCampaignId } });
      const controlRecipients = recipients.filter((r) => r.variantId === controlVariant.id);
      expect(controlRecipients.length).toBeGreaterThan(0);
      for (const r of controlRecipients) {
        expect(r.messageId).toBeNull();
        expect(r.skippedReason).toBe("Control group — no message sent by design (A/B experiment)");
      }

      const statsRes = await authed("get", `/v1/campaigns/${experimentCampaignId}/stats`);
      expect(statsRes.body.experiment).not.toBeNull();
      expect(statsRes.body.experiment.controlVariantId).toBe(controlVariant.id);
      expect(statsRes.body.experiment.lift).toHaveLength(1);
      expect(statsRes.body.experiment.lift[0].variantId).not.toBe(controlVariant.id);
    });
  });
});
