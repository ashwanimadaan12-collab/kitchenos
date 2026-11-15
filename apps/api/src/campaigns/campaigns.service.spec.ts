import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import { CommunicationsService } from "../communications/communications.service.js";
import { SegmentsService } from "./segments.service.js";
import { CampaignsService } from "./campaigns.service.js";

const D = (v: string) => new Prisma.Decimal(v);

describe("CampaignsService", () => {
  let service: CampaignsService;
  let communications: { sendUsingTemplateId: jest.Mock };
  let segments: { resolveCustomerIds: jest.Mock };
  let prisma: {
    customerSegment: { findFirst: jest.Mock };
    communicationTemplate: { findFirst: jest.Mock };
    campaign: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    campaignRecipient: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      customerSegment: { findFirst: jest.fn() },
      communicationTemplate: { findFirst: jest.fn() },
      campaign: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      campaignRecipient: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    };
    communications = { sendUsingTemplateId: jest.fn() };
    segments = { resolveCustomerIds: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationsService, useValue: communications },
        { provide: SegmentsService, useValue: segments },
      ],
    }).compile();
    service = module.get(CampaignsService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe("create", () => {
    it("404s when the segment belongs to another organization", async () => {
      prisma.customerSegment.findFirst.mockResolvedValue(null);
      await expect(
        service.create("org_1", "user_1", {
          name: "Win-back",
          type: "WIN_BACK",
          segmentId: "seg_from_org_2",
          conversionWindowDays: 7,
          variants: [{ name: "A", templateId: "tmpl_1", trafficPercent: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("404s when a variant's template isn't an active WhatsApp promotional template", async () => {
      prisma.customerSegment.findFirst.mockResolvedValue({ id: "seg_1" });
      prisma.communicationTemplate.findFirst.mockResolvedValue(null);
      await expect(
        service.create("org_1", "user_1", {
          name: "Win-back",
          type: "WIN_BACK",
          segmentId: "seg_1",
          conversionWindowDays: 7,
          variants: [{ name: "A", templateId: "tmpl_not_whatsapp", trafficPercent: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("creates the campaign with its variants, SCHEDULED when given a scheduledFor", async () => {
      prisma.customerSegment.findFirst.mockResolvedValue({ id: "seg_1" });
      prisma.communicationTemplate.findFirst.mockResolvedValue({ id: "tmpl_1" });
      prisma.campaign.create.mockResolvedValue({ id: "camp_1", status: "SCHEDULED" });

      const scheduledFor = new Date(Date.now() + 60_000);
      await service.create("org_1", "user_1", {
        name: "Weekend combo",
        type: "WEEKEND_COMBO",
        segmentId: "seg_1",
        scheduledFor,
        conversionWindowDays: 7,
        variants: [{ name: "A", templateId: "tmpl_1", trafficPercent: 100 }],
      });

      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "SCHEDULED", scheduledFor }),
        }),
      );
    });
  });

  describe("cancel", () => {
    it("refuses to cancel a campaign that's already running", async () => {
      prisma.campaign.findFirst.mockResolvedValue({ id: "camp_1", status: "RUNNING" });
      await expect(service.cancel("org_1", "camp_1")).rejects.toThrow(ConflictException);
    });
  });

  describe("dispatchCampaign", () => {
    it("refuses to dispatch a campaign that's already completed", async () => {
      prisma.campaign.findFirst.mockResolvedValue({ id: "camp_1", status: "COMPLETED", variants: [{ id: "v1" }] });
      await expect(service.dispatchCampaign("org_1", "camp_1")).rejects.toThrow(ConflictException);
    });

    it("sends to every newly-resolved customer, skips those already targeted, and marks COMPLETED", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        status: "DRAFT",
        budgetAmount: null,
        costPerMessage: D("0.5"),
        segment: { id: "seg_1", type: "ALL" },
        variants: [{ id: "v1", name: "A", templateId: "tmpl_1", trafficPercent: 100 }],
      });
      segments.resolveCustomerIds.mockResolvedValue(["cust_1", "cust_2"]);
      prisma.campaignRecipient.findMany.mockResolvedValue([{ customerId: "cust_1" }]); // already targeted
      communications.sendUsingTemplateId.mockResolvedValue({ id: "msg_1" });

      await service.dispatchCampaign("org_1", "camp_1");

      expect(communications.sendUsingTemplateId).toHaveBeenCalledTimes(1);
      expect(communications.sendUsingTemplateId).toHaveBeenCalledWith("org_1", "cust_2", "tmpl_1", "PROMOTIONAL");
      expect(prisma.campaignRecipient.create).toHaveBeenCalledWith({
        data: { organizationId: "org_1", campaignId: "camp_1", variantId: "v1", customerId: "cust_2", messageId: "msg_1" },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: "camp_1" },
        data: { status: "COMPLETED", completedAt: expect.any(Date) },
      });
    });

    it("stops sending once the budget is exhausted, recording the rest as skipped", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        status: "DRAFT",
        budgetAmount: D("1"), // 1 / 0.5 = 2 recipients max
        costPerMessage: D("0.5"),
        segment: { id: "seg_1", type: "ALL" },
        variants: [{ id: "v1", name: "A", templateId: "tmpl_1", trafficPercent: 100 }],
      });
      segments.resolveCustomerIds.mockResolvedValue(["cust_1", "cust_2", "cust_3"]);
      communications.sendUsingTemplateId.mockResolvedValue({ id: "msg_1" });

      await service.dispatchCampaign("org_1", "camp_1");

      expect(communications.sendUsingTemplateId).toHaveBeenCalledTimes(2);
      expect(prisma.campaignRecipient.create).toHaveBeenCalledWith({
        data: { organizationId: "org_1", campaignId: "camp_1", variantId: "v1", customerId: "cust_3", skippedReason: "Campaign budget exhausted" },
      });
    });

    it("splits recipients across variants roughly proportional to trafficPercent", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        status: "DRAFT",
        budgetAmount: null,
        costPerMessage: D("0.5"),
        segment: { id: "seg_1", type: "ALL" },
        variants: [
          { id: "v_a", name: "A", templateId: "tmpl_a", trafficPercent: 70 },
          { id: "v_b", name: "B", templateId: "tmpl_b", trafficPercent: 30 },
        ],
      });
      const customerIds = Array.from({ length: 100 }, (_, i) => `cust_${i}`);
      segments.resolveCustomerIds.mockResolvedValue(customerIds);
      communications.sendUsingTemplateId.mockResolvedValue({ id: "msg_1" });

      await service.dispatchCampaign("org_1", "camp_1");

      const templateIdsUsed = communications.sendUsingTemplateId.mock.calls.map((call) => call[2]);
      expect(templateIdsUsed.filter((t) => t === "tmpl_a")).toHaveLength(70);
      expect(templateIdsUsed.filter((t) => t === "tmpl_b")).toHaveLength(30);
    });

    it("records a skipped recipient (not a crash) when sending throws unexpectedly", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        status: "DRAFT",
        budgetAmount: null,
        costPerMessage: D("0.5"),
        segment: { id: "seg_1", type: "ALL" },
        variants: [{ id: "v1", name: "A", templateId: "tmpl_1", trafficPercent: 100 }],
      });
      segments.resolveCustomerIds.mockResolvedValue(["cust_1"]);
      communications.sendUsingTemplateId.mockRejectedValue(new Error("provider down"));

      await service.dispatchCampaign("org_1", "camp_1");

      expect(prisma.campaignRecipient.create).toHaveBeenCalledWith({
        data: { organizationId: "org_1", campaignId: "camp_1", variantId: "v1", customerId: "cust_1", skippedReason: "Unexpected send error" },
      });
    });

    it("never sends to a customer bucketed into the control-group variant, recording them without a message", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        status: "DRAFT",
        budgetAmount: null,
        costPerMessage: D("0.5"),
        segment: { id: "seg_1", type: "ALL" },
        variants: [{ id: "v_control", name: "Control", templateId: null, trafficPercent: 100, isControl: true }],
      });
      segments.resolveCustomerIds.mockResolvedValue(["cust_1"]);

      await service.dispatchCampaign("org_1", "camp_1");

      expect(communications.sendUsingTemplateId).not.toHaveBeenCalled();
      expect(prisma.campaignRecipient.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org_1",
          campaignId: "camp_1",
          variantId: "v_control",
          customerId: "cust_1",
          skippedReason: "Control group — no message sent by design (A/B experiment)",
        },
      });
    });
  });

  describe("recordConversionIfAny", () => {
    it("does nothing when there is no pending campaign recipient for this customer", async () => {
      prisma.campaignRecipient.findMany.mockResolvedValue([]);
      await service.recordConversionIfAny("org_1", "cust_1", "order_1", D("500"));
      expect(prisma.campaignRecipient.update).not.toHaveBeenCalled();
    });

    it("attributes the order to the most recent recipient still within its conversion window", async () => {
      const recent = { id: "rec_recent", createdAt: new Date(), campaign: { conversionWindowDays: 7 } };
      const stale = {
        id: "rec_stale",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        campaign: { conversionWindowDays: 7 },
      };
      prisma.campaignRecipient.findMany.mockResolvedValue([recent, stale]);

      await service.recordConversionIfAny("org_1", "cust_1", "order_1", D("500"));

      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
        where: { id: "rec_recent" },
        data: { convertedOrderId: "order_1", attributedRevenue: D("500") },
      });
    });

    it("skips a recipient whose conversion window has already closed", async () => {
      const stale = {
        id: "rec_stale",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        campaign: { conversionWindowDays: 7 },
      };
      prisma.campaignRecipient.findMany.mockResolvedValue([stale]);

      await service.recordConversionIfAny("org_1", "cust_1", "order_1", D("500"));

      expect(prisma.campaignRecipient.update).not.toHaveBeenCalled();
    });

    it("never throws, even if the lookup fails", async () => {
      prisma.campaignRecipient.findMany.mockRejectedValue(new Error("db exploded"));
      await expect(service.recordConversionIfAny("org_1", "cust_1", "order_1", D("500"))).resolves.toBeUndefined();
    });

    it("still attributes a conversion for a control-group recipient, even though they were never sent a message", async () => {
      const controlRecipient = { id: "rec_control", createdAt: new Date(), campaign: { conversionWindowDays: 7 } };
      prisma.campaignRecipient.findMany.mockResolvedValue([controlRecipient]);

      await service.recordConversionIfAny("org_1", "cust_1", "order_1", D("500"));

      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
        where: { id: "rec_control" },
        data: { convertedOrderId: "order_1", attributedRevenue: D("500") },
      });
      // The query itself is what makes this possible — it must accept a control-group
      // recipient (no delivered message) as a valid candidate, not just a delivered one.
      expect(prisma.campaignRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ message: { status: { in: ["SENT", "DELIVERED"] } } }, { variant: { isControl: true } }],
          }),
        }),
      );
    });
  });

  describe("getStats", () => {
    it("aggregates targeted/sent/delivered/failed/skipped/converted/revenue, overall and per variant", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        variants: [
          { id: "v_a", name: "A", isControl: false },
          { id: "v_b", name: "B", isControl: false },
        ],
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { variantId: "v_a", message: { status: "DELIVERED" }, skippedReason: null, convertedOrderId: "order_1", attributedRevenue: D("200") },
        { variantId: "v_a", message: { status: "SENT" }, skippedReason: null, convertedOrderId: null, attributedRevenue: null },
        { variantId: "v_b", message: { status: "FAILED" }, skippedReason: null, convertedOrderId: null, attributedRevenue: null },
        { variantId: "v_b", message: null, skippedReason: "Campaign budget exhausted", convertedOrderId: null, attributedRevenue: null },
      ]);

      const stats = await service.getStats("org_1", "camp_1");

      expect(stats.targeted).toBe(4);
      expect(stats.delivered).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.converted).toBe(1);
      expect(stats.revenueAttributed.toString()).toBe("200");
      expect(stats.variants).toHaveLength(2);
      const variantA = stats.variants.find((v) => v.name === "A");
      expect(variantA?.targeted).toBe(2);
      expect(variantA?.converted).toBe(1);
      expect(stats.experiment).toBeNull();
    });

    it("computes each variant's lift over the control group when one variant is marked isControl", async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        variants: [
          { id: "v_treatment", name: "Treatment", isControl: false },
          { id: "v_control", name: "Control", isControl: true },
        ],
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([
        // Treatment: 2 targeted, 1 converted for 200 -> conversionRate 50%, revenue/recipient 100.
        { variantId: "v_treatment", message: { status: "DELIVERED" }, skippedReason: null, convertedOrderId: "order_1", attributedRevenue: D("200") },
        { variantId: "v_treatment", message: { status: "DELIVERED" }, skippedReason: null, convertedOrderId: null, attributedRevenue: null },
        // Control: 2 targeted, 0 converted -> conversionRate 0%, revenue/recipient 0.
        { variantId: "v_control", message: null, skippedReason: "Control group — no message sent by design (A/B experiment)", convertedOrderId: null, attributedRevenue: null },
        { variantId: "v_control", message: null, skippedReason: "Control group — no message sent by design (A/B experiment)", convertedOrderId: null, attributedRevenue: null },
      ]);

      const stats = await service.getStats("org_1", "camp_1");

      expect(stats.experiment).not.toBeNull();
      expect(stats.experiment?.controlVariantId).toBe("v_control");
      const lift = stats.experiment?.lift.find((l) => l.variantId === "v_treatment");
      expect(lift?.conversionRateLift).toBe(50);
      expect(lift?.revenuePerRecipientLift.toString()).toBe("100");
    });

    it("still reports a variant that ended up with zero recipients, rather than dropping it", async () => {
      // A small segment can easily leave one side of an A/B split with nobody bucketed into
      // it — the stats must still name that variant at zero, not omit it from the response.
      prisma.campaign.findFirst.mockResolvedValue({
        id: "camp_1",
        variants: [
          { id: "v_a", name: "A", isControl: false },
          { id: "v_b", name: "B", isControl: false },
        ],
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { variantId: "v_a", message: { status: "SENT" }, skippedReason: null, convertedOrderId: null, attributedRevenue: null },
      ]);

      const stats = await service.getStats("org_1", "camp_1");

      expect(stats.variants).toHaveLength(2);
      const variantB = stats.variants.find((v) => v.variantId === "v_b");
      expect(variantB?.targeted).toBe(0);
    });
  });
});
