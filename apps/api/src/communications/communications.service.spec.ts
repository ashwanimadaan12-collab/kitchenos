import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CommunicationsService, type OrderForCommunication } from "./communications.service.js";
import { WhatsAppCloudProvider } from "./providers/whatsapp-cloud.provider.js";
import { SmsTwilioProvider } from "./providers/sms-twilio.provider.js";
import { CommunicationProviderError } from "./providers/communication-provider.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("CommunicationsService", () => {
  let service: CommunicationsService;
  let whatsapp: { channel: "WHATSAPP"; send: jest.Mock };
  let sms: { channel: "SMS"; send: jest.Mock };
  let prisma: {
    brand: { findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    communicationTemplate: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    customerCommunicationPreference: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
    communicationMessage: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      brand: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      communicationTemplate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      customerCommunicationPreference: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      communicationMessage: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    whatsapp = { channel: "WHATSAPP", send: jest.fn() };
    sms = { channel: "SMS", send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppCloudProvider, useValue: whatsapp },
        { provide: SmsTwilioProvider, useValue: sms },
      ],
    }).compile();
    service = module.get(CommunicationsService);
  });

  describe("templates", () => {
    it("createTemplate() 404s when brandId belongs to another organization", async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.createTemplate("org_1", {
          brandId: "brand_from_org_2",
          channel: "WHATSAPP",
          purpose: "TRANSACTIONAL",
          key: "order_confirmation",
          name: "Order confirmation",
          body: "Thanks!",
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.communicationTemplate.create).not.toHaveBeenCalled();
    });

    it("createTemplate() rejects a second org-wide template for the same channel/key (app-level guard, not just the DB index)", async () => {
      prisma.communicationTemplate.findFirst.mockResolvedValue({ id: "tmpl_existing" });
      await expect(
        service.createTemplate("org_1", {
          channel: "WHATSAPP",
          purpose: "TRANSACTIONAL",
          key: "order_confirmation",
          name: "Duplicate",
          body: "x",
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.communicationTemplate.create).not.toHaveBeenCalled();
    });

    it("createTemplate() maps a duplicate (org, channel, key) to a 409 Conflict", async () => {
      prisma.communicationTemplate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
      );
      await expect(
        service.createTemplate("org_1", {
          channel: "WHATSAPP",
          purpose: "TRANSACTIONAL",
          key: "order_confirmation",
          name: "Order confirmation",
          body: "Thanks!",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("updateTemplate() 404s for a template from another organization", async () => {
      prisma.communicationTemplate.findFirst.mockResolvedValue(null);
      await expect(service.updateTemplate("org_1", "tmpl_from_org_2", { isActive: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("preferences and consent", () => {
    it("recordConsent() 404s for a customer from another organization", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.recordConsent("org_1", "cust_from_org_2", "WHATSAPP", { source: "pos_checkout" }, "user_1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("recordConsent() upserts marketingOptIn true with the given source and clears any prior opt-out", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customerCommunicationPreference.upsert.mockResolvedValue({ marketingOptIn: true });

      await service.recordConsent("org_1", "cust_1", "WHATSAPP", { source: "pos_checkout" }, "user_1");

      expect(prisma.customerCommunicationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId_channel: { customerId: "cust_1", channel: "WHATSAPP" } },
          update: expect.objectContaining({ marketingOptIn: true, consentSource: "pos_checkout", optedOutAt: null }),
        }),
      );
    });

    it("optOut() with scope MARKETING only clears marketingOptIn, leaving transactional messages allowed", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customerCommunicationPreference.upsert.mockResolvedValue({});

      await service.optOut("org_1", "cust_1", "WHATSAPP", { scope: "MARKETING" });

      const data = prisma.customerCommunicationPreference.upsert.mock.calls[0][0].update;
      expect(data.marketingOptIn).toBe(false);
      expect(data.transactionalOptIn).toBeUndefined();
    });

    it("optOut() with scope ALL also clears transactionalOptIn", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1" });
      prisma.customerCommunicationPreference.upsert.mockResolvedValue({});

      await service.optOut("org_1", "cust_1", "WHATSAPP", { scope: "ALL" });

      const data = prisma.customerCommunicationPreference.upsert.mock.calls[0][0].update;
      expect(data.transactionalOptIn).toBe(false);
    });
  });

  describe("sendMessage", () => {
    it("404s when the templateKey has no active template for that channel", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.communicationTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage("org_1", { customerId: "cust_1", channel: "WHATSAPP", purpose: "TRANSACTIONAL", templateKey: "missing" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("renders the template and dispatches immediately, recording SENT with the provider message id", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.communicationTemplate.findFirst.mockResolvedValue({
        id: "tmpl_1",
        body: "Hi {{name}}, your order is ready!",
        providerTemplateName: "order_ready",
        providerSenderId: null,
      });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "WHATSAPP", toAddress: "+911234567890", body: "Hi Asha, your order is ready!" });
      whatsapp.send.mockResolvedValue({ providerMessageId: "wamid.123" });
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "SENT" });

      const result = await service.sendMessage("org_1", {
        customerId: "cust_1",
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        templateKey: "order_ready",
        variables: { name: "Asha" },
      });

      expect(whatsapp.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+911234567890", body: "Hi Asha, your order is ready!", providerTemplateName: "order_ready" }),
      );
      expect(prisma.communicationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerMessageId: "wamid.123" }) }),
      );
      expect(result.status).toBe("SENT");
    });

    it("skips a PROMOTIONAL send without marketing consent — SKIPPED, provider never called", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue({ marketingOptIn: false });
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", status: "SKIPPED" });

      const result = await service.sendMessage("org_1", {
        customerId: "cust_1",
        channel: "WHATSAPP",
        purpose: "PROMOTIONAL",
        body: "50% off today!",
      });

      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(prisma.communicationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }),
      );
      expect(result.status).toBe("SKIPPED");
    });

    it("sends a PROMOTIONAL message once the customer has opted in", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue({ marketingOptIn: true, optedOutAt: null });
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "SMS", toAddress: "+911234567890", body: "50% off!" });
      sms.send.mockResolvedValue({ providerMessageId: "SM123" });
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "SENT" });

      await service.sendMessage("org_1", { customerId: "cust_1", channel: "SMS", purpose: "PROMOTIONAL", body: "50% off!" });

      expect(sms.send).toHaveBeenCalled();
    });

    it("skips a TRANSACTIONAL send when the customer fully opted out", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue({ transactionalOptIn: false });
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", status: "SKIPPED" });

      await service.sendMessage("org_1", { customerId: "cust_1", channel: "WHATSAPP", purpose: "TRANSACTIONAL", body: "Your order is ready" });

      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it("schedules a future-dated message instead of dispatching immediately", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", status: "SCHEDULED" });

      const future = new Date(Date.now() + 60_000);
      const result = await service.sendMessage("org_1", {
        customerId: "cust_1",
        channel: "WHATSAPP",
        purpose: "TRANSACTIONAL",
        body: "Reminder",
        scheduledFor: future,
      });

      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(prisma.communicationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED", scheduledFor: future }) }),
      );
      expect(result.status).toBe("SCHEDULED");
    });

    it("records a FAILED status with the provider's reason when the provider rejects the send", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "WHATSAPP", toAddress: "+911234567890", body: "Hi" });
      whatsapp.send.mockRejectedValue(new CommunicationProviderError("WhatsApp Cloud API rejected the message: invalid number"));
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "FAILED" });

      await service.sendMessage("org_1", { customerId: "cust_1", channel: "WHATSAPP", purpose: "TRANSACTIONAL", body: "Hi" });

      expect(prisma.communicationMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED", failureReason: "WhatsApp Cloud API rejected the message: invalid number" }),
        }),
      );
    });
  });

  describe("sendUsingTemplateId", () => {
    it("404s for a customer from another organization", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.sendUsingTemplateId("org_1", "cust_from_org_2", "tmpl_1", "PROMOTIONAL"),
      ).rejects.toThrow(NotFoundException);
    });

    it("404s for a template from another organization", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.communicationTemplate.findFirst.mockResolvedValue(null);
      await expect(
        service.sendUsingTemplateId("org_1", "cust_1", "tmpl_from_org_2", "PROMOTIONAL"),
      ).rejects.toThrow(NotFoundException);
    });

    it("renders the exact template row given (not looked up by key) and dispatches it", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.communicationTemplate.findFirst.mockResolvedValue({
        id: "tmpl_variant_b",
        channel: "WHATSAPP",
        body: "{{brand}} weekend special!",
        providerTemplateName: "weekend_special_v1",
        providerSenderId: null,
      });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue({ marketingOptIn: true });
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "WHATSAPP", toAddress: "+911234567890", body: "Paproni weekend special!" });
      whatsapp.send.mockResolvedValue({ providerMessageId: "wamid.1" });
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "SENT" });

      const result = await service.sendUsingTemplateId("org_1", "cust_1", "tmpl_variant_b", "PROMOTIONAL", { brand: "Paproni" });

      expect(prisma.communicationTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: "tmpl_variant_b", organizationId: "org_1" },
      });
      expect(prisma.communicationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "Paproni weekend special!", purpose: "PROMOTIONAL" }) }),
      );
      expect(result.status).toBe("SENT");
    });

    it("skips (not errors) a PROMOTIONAL send to a customer without marketing consent", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "cust_1", phone: "+911234567890" });
      prisma.communicationTemplate.findFirst.mockResolvedValue({
        id: "tmpl_1",
        channel: "WHATSAPP",
        body: "50% off!",
        providerTemplateName: "promo_v1",
        providerSenderId: null,
      });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", status: "SKIPPED" });

      const result = await service.sendUsingTemplateId("org_1", "cust_1", "tmpl_1", "PROMOTIONAL");

      expect(whatsapp.send).not.toHaveBeenCalled();
      expect(result.status).toBe("SKIPPED");
    });
  });

  describe("retryMessage", () => {
    it("404s for a message from another organization", async () => {
      prisma.communicationMessage.findFirst.mockResolvedValue(null);
      await expect(service.retryMessage("org_1", "msg_from_org_2")).rejects.toThrow(NotFoundException);
    });

    it("refuses to retry a message that is not FAILED", async () => {
      prisma.communicationMessage.findFirst.mockResolvedValue({ id: "msg_1", status: "SENT" });
      await expect(service.retryMessage("org_1", "msg_1")).rejects.toThrow(ConflictException);
    });

    it("re-dispatches a FAILED message using its original template", async () => {
      prisma.communicationMessage.findFirst.mockResolvedValue({
        id: "msg_1",
        status: "FAILED",
        channel: "WHATSAPP",
        toAddress: "+911234567890",
        body: "Hi",
        template: { providerTemplateName: "order_ready", providerSenderId: null },
      });
      whatsapp.send.mockResolvedValue({ providerMessageId: "wamid.456" });
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "SENT" });

      await service.retryMessage("org_1", "msg_1");

      expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ providerTemplateName: "order_ready" }));
    });
  });

  describe("dispatchDue", () => {
    it("dispatches every QUEUED/due-SCHEDULED message and returns the count", async () => {
      prisma.communicationMessage.findMany.mockResolvedValue([
        { id: "msg_1", channel: "WHATSAPP", toAddress: "+91111", body: "a", template: null },
        { id: "msg_2", channel: "SMS", toAddress: "+91222", body: "b", template: null },
      ]);
      whatsapp.send.mockResolvedValue({ providerMessageId: "wamid.1" });
      sms.send.mockResolvedValue({ providerMessageId: "SM1" });
      prisma.communicationMessage.update.mockResolvedValue({});

      const count = await service.dispatchDue("org_1");

      expect(count).toBe(2);
      expect(whatsapp.send).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("order confirmation / status notifications", () => {
    const order: OrderForCommunication = {
      id: "order_1",
      orderNumber: 42,
      status: "PAID",
      total: D("349.99"),
      customerId: "cust_1",
      customer: { id: "cust_1", phone: "+911234567890", loyaltyPoints: 3 },
      outlet: { name: "Koramangala", brandId: "brand_1", brand: { name: "Old Monk Kitchen" } },
      items: [{ status: "ACTIVE", productName: "Filter Coffee", quantity: 2 }],
    };

    it("does nothing when the order has no linked customer", async () => {
      await service.sendOrderConfirmation("org_1", { ...order, customerId: null, customer: null });
      expect(prisma.communicationTemplate.findFirst).not.toHaveBeenCalled();
    });

    it("silently skips when no active order_confirmation template is configured on either channel", async () => {
      prisma.communicationTemplate.findFirst.mockResolvedValue(null);
      await service.sendOrderConfirmation("org_1", order);
      expect(prisma.communicationMessage.create).not.toHaveBeenCalled();
    });

    it("renders and queues the order confirmation with brand/outlet/items/total/status/loyalty points", async () => {
      prisma.communicationTemplate.findFirst.mockResolvedValueOnce({
        id: "tmpl_1",
        body: "{{brand}} ({{outlet}}): order #{{orderNumber}} [{{items}}] total {{total}} is {{paymentStatus}}. Points: {{loyaltyPoints}}",
        providerTemplateName: "order_confirmation_v1",
        providerSenderId: null,
      });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "WHATSAPP", toAddress: "+911234567890", body: "rendered" });
      whatsapp.send.mockResolvedValue({ providerMessageId: "wamid.9" });
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "SENT" });

      await service.sendOrderConfirmation("org_1", order);

      expect(prisma.communicationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            body: "Old Monk Kitchen (Koramangala): order #42 [2x Filter Coffee] total 349.99 is PAID. Points: 3",
            purpose: "TRANSACTIONAL",
          }),
        }),
      );
    });

    it("never throws even if the provider call fails", async () => {
      prisma.communicationTemplate.findFirst.mockResolvedValueOnce({
        id: "tmpl_1",
        body: "Order #{{orderNumber}}",
        providerTemplateName: "order_confirmation_v1",
        providerSenderId: null,
      });
      prisma.customerCommunicationPreference.findUnique.mockResolvedValue(null);
      prisma.communicationMessage.create.mockResolvedValue({ id: "msg_1", channel: "WHATSAPP", toAddress: "+911234567890", body: "Order #42" });
      whatsapp.send.mockRejectedValue(new Error("network down"));
      prisma.communicationMessage.update.mockResolvedValue({ id: "msg_1", status: "FAILED" });

      await expect(service.sendOrderConfirmation("org_1", order)).resolves.toBeUndefined();
    });
  });

  describe("markDeliveredByProviderMessageId", () => {
    it("marks a message DELIVERED by its provider message id", async () => {
      await service.markDeliveredByProviderMessageId("wamid.123", "DELIVERED");
      expect(prisma.communicationMessage.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: "wamid.123" },
        data: expect.objectContaining({ status: "DELIVERED" }),
      });
    });

    it("marks a message FAILED with a reason by its provider message id", async () => {
      await service.markDeliveredByProviderMessageId("wamid.123", "FAILED", "undeliverable");
      expect(prisma.communicationMessage.updateMany).toHaveBeenCalledWith({
        where: { providerMessageId: "wamid.123" },
        data: expect.objectContaining({ status: "FAILED", failureReason: "undeliverable" }),
      });
    });
  });
});
