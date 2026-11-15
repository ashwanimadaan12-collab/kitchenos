import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import { INestApplication, VersioningType } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@kitchenos/database";
import { AppModule } from "../src/app.module.js";

describe("Communications (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let paproniBrandId: string;
  let paproniDineInMenuId: string;
  let margheritaMediumVariantId: string;
  let testOutletId: string;
  let customerId: string;

  // ids created during the suite, torn down in afterAll so repeat runs stay clean.
  let templateId: string;
  let brandTemplateId: string;
  let adHocMessageId: string;
  let otherOrgId: string;
  let otherCustomerId: string;
  let otherTemplateId: string;

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

    const productsRes = await authed("get", `/v1/products?brandId=${paproniBrandId}`);
    const margherita = productsRes.body.find((p: { sku: string }) => p.sku === "PP-MARG");
    margheritaMediumVariantId = margherita.variants.find((v: { name: string }) => v.name === "Medium").id;

    const menusRes = await authed("get", `/v1/menus?brandId=${paproniBrandId}`);
    paproniDineInMenuId = menusRes.body.find((m: { name: string }) => m.name === "Dine-in Menu").id;

    const outletRes = await authed("post", "/v1/outlets").send({
      brandId: paproniBrandId,
      name: "Paproni - Communications Test",
      code: "PP-COMMS-01",
    });
    testOutletId = outletRes.body.id;
    await authed("post", `/v1/menus/${paproniDineInMenuId}/outlets`).send({ outletId: testOutletId });

    const customerRes = await authed("post", "/v1/customers").send({
      name: "Comms Test Customer",
      phone: `+91-91${randomUUID().slice(0, 8)}`,
    });
    customerId = customerRes.body.id;

    // A second, fully isolated tenant used only to prove cross-org access is impossible.
    const otherOrg = await prisma.organization.create({
      data: { name: `Other Org ${randomUUID()}`, slug: `other-org-comms-${randomUUID()}` },
    });
    otherOrgId = otherOrg.id;
    const otherCustomer = await prisma.customer.create({
      data: { organizationId: otherOrgId, name: "Rival Customer", phone: "+91-9333333333" },
    });
    otherCustomerId = otherCustomer.id;
    const otherTemplate = await prisma.communicationTemplate.create({
      data: {
        organizationId: otherOrgId,
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        key: "order_confirmation",
        name: "Rival template",
        body: "Rival body",
      },
    });
    otherTemplateId = otherTemplate.id;
  });

  afterAll(async () => {
    await prisma.communicationMessage.deleteMany({ where: { organizationId } }).catch(() => undefined);
    if (templateId) await prisma.communicationTemplate.delete({ where: { id: templateId } }).catch(() => undefined);
    if (brandTemplateId) await prisma.communicationTemplate.delete({ where: { id: brandTemplateId } }).catch(() => undefined);
    if (testOutletId) await prisma.outlet.delete({ where: { id: testOutletId } }).catch(() => undefined);
    if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: otherOrgId } }).catch(() => undefined);
    await app.close();
  });

  it("rejects unauthenticated access", async () => {
    for (const path of ["/v1/communication-templates", "/v1/communications/messages"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(401);
    }
  });

  describe("templates", () => {
    it("404s when brandId belongs to another organization", async () => {
      const otherBrand = await prisma.brand.create({
        data: { organizationId: otherOrgId, name: "Rival Brand", slug: "rival-brand-comms" },
      });
      const res = await authed("post", "/v1/communication-templates").send({
        brandId: otherBrand.id,
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        key: `test_key_${randomUUID().slice(0, 8)}`,
        name: "Test",
        body: "Hello",
      });
      expect(res.status).toBe(404);
      await prisma.brand.delete({ where: { id: otherBrand.id } }).catch(() => undefined);
    });

    it("creates an organization-wide template and a brand-specific override for the same key/channel", async () => {
      const key = `e2e_order_test_${randomUUID().slice(0, 8)}`;
      const createRes = await authed("post", "/v1/communication-templates").send({
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        key,
        name: "E2E org-wide template",
        body: "Hi {{name}}, thanks for your order!",
        providerTemplateName: "e2e_test_v1",
      });
      expect(createRes.status).toBe(201);
      templateId = createRes.body.id;

      const brandRes = await authed("post", "/v1/communication-templates").send({
        brandId: paproniBrandId,
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        key,
        name: "E2E brand-specific template",
        body: "🍕 Hi {{name}}, your Pizza Paproni order is confirmed!",
      });
      expect(brandRes.status).toBe(201);
      brandTemplateId = brandRes.body.id;

      // Creating the exact same (org, channel, key) combination again is a conflict...
      const dupRes = await authed("post", "/v1/communication-templates").send({
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        key,
        name: "Duplicate",
        body: "x",
      });
      expect(dupRes.status).toBe(409);

      const listRes = await authed("get", "/v1/communication-templates?channel=WHATSAPP");
      expect(listRes.body.some((t: { id: string }) => t.id === templateId)).toBe(true);
      expect(listRes.body.some((t: { id: string }) => t.id === brandTemplateId)).toBe(true);
    });

    it("updates a template", async () => {
      const res = await authed("patch", `/v1/communication-templates/${templateId}`).send({ name: "Renamed" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Renamed");
    });

    it("never lets a template from another organization be updated", async () => {
      const res = await authed("patch", `/v1/communication-templates/${otherTemplateId}`).send({ name: "Hacked" });
      expect(res.status).toBe(404);
    });
  });

  describe("preferences and consent", () => {
    it("lists no preference rows for a customer with none recorded yet", async () => {
      const res = await authed("get", `/v1/customers/${customerId}/communication-preferences`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("404s recording consent for a customer from another organization", async () => {
      const res = await authed("post", `/v1/customers/${otherCustomerId}/communication-preferences/WHATSAPP/consent`).send({
        source: "pos_checkout",
      });
      expect(res.status).toBe(404);
    });

    it("records marketing consent with evidence, then opts out of marketing only", async () => {
      const consentRes = await authed("post", `/v1/customers/${customerId}/communication-preferences/WHATSAPP/consent`).send({
        source: "pos_checkout",
      });
      expect(consentRes.status).toBe(201);
      expect(consentRes.body.marketingOptIn).toBe(true);
      expect(consentRes.body.consentSource).toBe("pos_checkout");
      expect(consentRes.body.consentGivenAt).not.toBeNull();

      const optOutRes = await authed("post", `/v1/customers/${customerId}/communication-preferences/WHATSAPP/opt-out`).send({
        scope: "MARKETING",
      });
      expect(optOutRes.status).toBe(201);
      expect(optOutRes.body.marketingOptIn).toBe(false);
      expect(optOutRes.body.transactionalOptIn).toBe(true);
    });
  });

  describe("sendMessage", () => {
    it("skips a PROMOTIONAL send to a customer who has not consented", async () => {
      const res = await authed("post", "/v1/communications/messages").send({
        customerId,
        channel: "WHATSAPP",
        purpose: "PROMOTIONAL",
        body: "50% off this weekend!",
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("SKIPPED");
      expect(res.body.failureReason).toMatch(/consent/i);
    });

    it("sends (and attempts delivery of) a TRANSACTIONAL ad-hoc message, recording FAILED since no provider is configured in this environment", async () => {
      const res = await authed("post", "/v1/communications/messages").send({
        customerId,
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        body: "Your table is ready",
      });
      expect(res.status).toBe(201);
      adHocMessageId = res.body.id;
      expect(res.body.status).toBe("FAILED");
      expect(res.body.failureReason).toMatch(/not configured/i);
    });

    it("404s when templateKey has no active template for that channel", async () => {
      const res = await authed("post", "/v1/communications/messages").send({
        customerId,
        channel: "SMS",
        purpose: "TRANSACTIONAL",
        templateKey: `nonexistent_${randomUUID().slice(0, 8)}`,
      });
      expect(res.status).toBe(404);
    });

    it("schedules a future-dated message instead of attempting delivery now", async () => {
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await authed("post", "/v1/communications/messages").send({
        customerId,
        channel: "SMS",
        purpose: "TRANSACTIONAL",
        body: "Reminder",
        scheduledFor,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("SCHEDULED");
    });

    it("lists message history filtered by customer", async () => {
      const res = await authed("get", `/v1/communications/messages?customerId=${customerId}`);
      expect(res.status).toBe(200);
      expect(res.body.some((m: { id: string }) => m.id === adHocMessageId)).toBe(true);
    });

    it("refuses to retry a message that is not FAILED, and retries one that is", async () => {
      const scheduledRes = await authed("get", `/v1/communications/messages?customerId=${customerId}&status=SCHEDULED`);
      const scheduledId = scheduledRes.body[0].id;
      const refuseRes = await authed("post", `/v1/communications/messages/${scheduledId}/retry`);
      expect(refuseRes.status).toBe(409);

      const retryRes = await authed("post", `/v1/communications/messages/${adHocMessageId}/retry`);
      expect(retryRes.status).toBe(201);
      expect(retryRes.body.status).toBe("FAILED"); // still no provider configured — fails again, deterministically.
    });

    it("dispatch-due reports how many due messages it processed", async () => {
      const res = await authed("post", "/v1/communications/messages/dispatch-due");
      expect(res.status).toBe(200);
      expect(typeof res.body.dispatched).toBe("number");
    });
  });

  describe("order lifecycle hooks", () => {
    it("records an order-confirmation attempt once a linked order is fully paid", async () => {
      const key = `order_confirmation`;
      // Ensure an org-wide order_confirmation template exists for this assertion (the seed
      // already creates one, but e2e specs shouldn't depend on seed data being present).
      const existing = await prisma.communicationTemplate.findFirst({
        where: { organizationId, channel: "WHATSAPP", key, brandId: null },
      });
      if (!existing) {
        const created = await authed("post", "/v1/communication-templates").send({
          channel: "WHATSAPP",
          purpose: "TRANSACTIONAL",
          key,
          name: "Order confirmation",
          body: "Order #{{orderNumber}} confirmed, total {{total}}",
        });
        templateId = templateId || created.body.id;
      }

      const orderRes = await authed("post", "/v1/orders").send({ outletId: testOutletId, channel: "DINE_IN", customerId });
      const orderId = orderRes.body.id;
      await authed("post", `/v1/orders/${orderId}/items`).send({ variantId: margheritaMediumVariantId, quantity: 1 });
      const payRes = await authed("post", `/v1/orders/${orderId}/payments`).send({ method: "CARD", amount: "411.82" });
      expect(payRes.body.status).toBe("PAID");

      const historyRes = await authed(
        "get",
        `/v1/communications/messages?customerId=${customerId}&purpose=TRANSACTIONAL`,
      );
      const confirmation = historyRes.body.find(
        (m: { metadata: { orderId?: string } | null }) => m.metadata?.orderId === orderId,
      );
      expect(confirmation).toBeDefined();
      expect(confirmation.body).toContain(String(orderRes.body.orderNumber));

      await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    });
  });

  describe("webhooks", () => {
    it("rejects a WhatsApp verification handshake when no verify token is configured", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/communications/webhooks/whatsapp")
        .query({ "hub.mode": "subscribe", "hub.verify_token": "anything", "hub.challenge": "challenge123" });
      expect(res.status).toBe(401);
    });

    it("rejects a WhatsApp status callback with no signature", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/communications/webhooks/whatsapp")
        .send({ entry: [] });
      expect(res.status).toBe(401);
    });

    it("rejects an SMS status callback with no signature", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/communications/webhooks/sms")
        .send({ MessageSid: "SM123", MessageStatus: "delivered" });
      expect(res.status).toBe(401);
    });
  });
});
