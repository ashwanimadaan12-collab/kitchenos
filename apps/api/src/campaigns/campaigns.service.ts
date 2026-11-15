import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaService } from "@kitchenos/database";
import type { CampaignFilterDto, CreateCampaignDto } from "@kitchenos/shared";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import { CommunicationsService } from "../communications/communications.service.js";
import { SegmentsService } from "./segments.service.js";

const { Decimal } = Prisma;

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsService.name);
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly communications: CommunicationsService,
    private readonly segments: SegmentsService,
  ) {}

  /** Same "real interval timer, skipped under Jest" scheduling stand-in as Prompts 13/14. */
  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID) return;
    this.sweepTimer = setInterval(() => {
      this.dispatchDueCampaigns().catch((err) => this.logger.error("Campaign dispatch sweep failed", err));
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async list(organizationId: string, filters: CampaignFilterDto) {
    return this.prisma.campaign.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { segment: true, variants: { include: { template: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    return assertBelongsToOrg(
      () =>
        this.prisma.campaign.findFirst({
          where: { id, organizationId },
          include: { segment: true, variants: { include: { template: true } } },
        }),
      "Campaign",
    );
  }

  async create(organizationId: string, userId: string, dto: CreateCampaignDto) {
    await assertBelongsToOrg(
      () => this.prisma.customerSegment.findFirst({ where: { id: dto.segmentId, organizationId } }),
      "Customer segment",
    );
    for (const variant of dto.variants) {
      // A control-group variant (Prompt 19's experiment support) deliberately sends nothing,
      // so it has no template to validate.
      if (variant.isControl) continue;
      // Campaigns are WhatsApp marketing automation specifically (this milestone's own title) —
      // every variant's template must be an active WHATSAPP/PROMOTIONAL one, not any template.
      const template = await this.prisma.communicationTemplate.findFirst({
        where: { id: variant.templateId, organizationId, channel: "WHATSAPP", purpose: "PROMOTIONAL", isActive: true },
      });
      if (!template) {
        throw new NotFoundException(
          `No active WhatsApp promotional template found for variant "${variant.name}" (templateId "${variant.templateId}")`,
        );
      }
    }

    return this.prisma.campaign.create({
      data: {
        organizationId,
        name: dto.name,
        type: dto.type,
        segmentId: dto.segmentId,
        status: dto.scheduledFor ? "SCHEDULED" : "DRAFT",
        scheduledFor: dto.scheduledFor,
        budgetAmount: dto.budgetAmount,
        conversionWindowDays: dto.conversionWindowDays,
        createdByUserId: userId,
        variants: {
          create: dto.variants.map((v) => ({
            name: v.name,
            templateId: v.isControl ? null : v.templateId,
            trafficPercent: v.trafficPercent,
            isControl: v.isControl ?? false,
          })),
        },
      },
      include: { segment: true, variants: { include: { template: true } } },
    });
  }

  async cancel(organizationId: string, id: string) {
    const campaign = await assertBelongsToOrg(
      () => this.prisma.campaign.findFirst({ where: { id, organizationId } }),
      "Campaign",
    );
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      throw new ConflictException(`Campaign is ${campaign.status.toLowerCase()}, can only cancel a draft or scheduled one`);
    }
    await this.prisma.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
    return this.findOne(organizationId, id);
  }

  /**
   * Resolves the segment, assigns each new customer to a variant proportionally to
   * trafficPercent, and sends through CommunicationsService (which enforces consent/opt-out —
   * not rebuilt here). Runs synchronously to completion in one call, the same "fine at this
   * data volume" tradeoff as every other on-demand computation in this codebase; a much larger
   * deployment would chunk this across multiple sweep ticks instead.
   */
  async dispatchCampaign(organizationId: string, id: string) {
    const campaign = await assertBelongsToOrg(
      () => this.prisma.campaign.findFirst({ where: { id, organizationId }, include: { segment: true, variants: true } }),
      "Campaign",
    );
    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      throw new ConflictException(`Campaign is ${campaign.status.toLowerCase()}, not draft or scheduled`);
    }
    if (campaign.variants.length === 0) {
      throw new ConflictException("Campaign has no variants to send");
    }

    await this.prisma.campaign.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date() } });

    const customerIds = await this.segments.resolveCustomerIds(organizationId, campaign.segment);
    const alreadyTargeted = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      select: { customerId: true },
    });
    const alreadyTargetedIds = new Set(alreadyTargeted.map((r) => r.customerId));
    const newCustomerIds = customerIds.filter((cid) => !alreadyTargetedIds.has(cid));

    const maxRecipients = campaign.budgetAmount
      ? Math.max(0, Math.floor(campaign.budgetAmount.div(campaign.costPerMessage).toNumber()) - alreadyTargetedIds.size)
      : Infinity;

    const variants = [...campaign.variants].sort((a, b) => a.name.localeCompare(b.name));
    const firstVariant = variants[0];
    // Guaranteed non-empty by the check above — only noUncheckedIndexedAccess's static typing
    // doesn't know that; this can never actually throw.
    if (!firstVariant) throw new ConflictException("Campaign has no variants to send");
    let cursor = 0;
    const buckets = variants.map((v) => {
      const start = cursor;
      cursor += v.trafficPercent;
      return { variant: v, start, end: cursor };
    });

    for (const [i, customerId] of newCustomerIds.entries()) {
      const bucket = i % 100;
      const picked = buckets.find((b) => bucket >= b.start && bucket < b.end)?.variant ?? firstVariant;

      if (i >= maxRecipients) {
        await this.prisma.campaignRecipient.create({
          data: { organizationId, campaignId: id, variantId: picked.id, customerId, skippedReason: "Campaign budget exhausted" },
        });
        continue;
      }

      // A control-group variant is the experiment's counterfactual baseline — targeted and
      // still eligible for conversion attribution (see recordConversionIfAny), but never sent
      // anything by design, not because of an error or a budget/consent gate.
      if (picked.isControl) {
        await this.prisma.campaignRecipient.create({
          data: {
            organizationId,
            campaignId: id,
            variantId: picked.id,
            customerId,
            skippedReason: "Control group — no message sent by design (A/B experiment)",
          },
        });
        continue;
      }

      try {
        const message = await this.communications.sendUsingTemplateId(organizationId, customerId, picked.templateId as string, "PROMOTIONAL");
        await this.prisma.campaignRecipient.create({
          data: { organizationId, campaignId: id, variantId: picked.id, customerId, messageId: message.id },
        });
      } catch (err) {
        this.logger.error(`Failed to send campaign "${id}" to customer "${customerId}"`, err);
        await this.prisma.campaignRecipient.create({
          data: { organizationId, campaignId: id, variantId: picked.id, customerId, skippedReason: "Unexpected send error" },
        });
      }
    }

    await this.prisma.campaign.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return this.findOne(organizationId, id);
  }

  /** Picked up by the interval timer, and callable directly (manual trigger, or a test). */
  async dispatchDueCampaigns(organizationId?: string): Promise<number> {
    const due = await this.prisma.campaign.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: "SCHEDULED",
        scheduledFor: { lte: new Date() },
      },
      take: 20,
    });
    for (const campaign of due) {
      try {
        await this.dispatchCampaign(campaign.organizationId, campaign.id);
      } catch (err) {
        this.logger.error(`Unexpected error dispatching campaign "${campaign.id}"`, err);
      }
    }
    return due.length;
  }

  /**
   * Best-effort — called from OrdersService.addPayment once an order with a linked customer
   * reaches PAID. Finds that customer's most recent still-open campaign send (across any
   * campaign, last-touch attribution) and, if its conversion window hasn't closed, attributes
   * this order's revenue to it. Never throws into the order flow.
   */
  async recordConversionIfAny(organizationId: string, customerId: string, orderId: string, orderTotal: Prisma.Decimal): Promise<void> {
    try {
      const candidates = await this.prisma.campaignRecipient.findMany({
        // Only a message the customer actually received counts as a trigger — not one that
        // was never sent (SKIPPED: no consent / budget exhausted) or that failed delivery.
        // The one deliberate exception is a control-group recipient: by design they never get
        // a message, but still need to be trackable as "targeted, did they convert anyway" —
        // that comparison against the promotional variants is the entire point of the group.
        where: {
          organizationId,
          customerId,
          convertedOrderId: null,
          OR: [{ message: { status: { in: ["SENT", "DELIVERED"] } } }, { variant: { isControl: true } }],
        },
        include: { campaign: { select: { conversionWindowDays: true } } },
        orderBy: { createdAt: "desc" },
      });
      const now = Date.now();
      const match = candidates.find((r) => now <= r.createdAt.getTime() + r.campaign.conversionWindowDays * 24 * 60 * 60 * 1000);
      if (!match) return;
      await this.prisma.campaignRecipient.update({
        where: { id: match.id },
        data: { convertedOrderId: orderId, attributedRevenue: orderTotal },
      });
    } catch (err) {
      this.logger.error(`Failed to record campaign conversion for customer "${customerId}"`, err);
    }
  }

  /** Aggregated, computed-on-demand performance numbers — never a cached/drifting counter. */
  async getStats(organizationId: string, campaignId: string) {
    const campaign = await this.findOne(organizationId, campaignId);
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { organizationId, campaignId },
      include: { message: { select: { status: true } } },
    });

    const totals = this.summarizeRecipients(recipients);
    const recipientsByVariant = new Map<string, typeof recipients>();
    for (const r of recipients) {
      const list = recipientsByVariant.get(r.variantId) ?? [];
      list.push(r);
      recipientsByVariant.set(r.variantId, list);
    }
    // Built from every configured variant, not just ones that happened to get a recipient —
    // a small segment can easily leave a variant with zero, especially a control group, and
    // the experiment comparison below needs both sides present even then.
    const variants = campaign.variants.map((v) => ({
      variantId: v.id,
      name: v.name,
      isControl: v.isControl,
      ...this.summarizeRecipients(recipientsByVariant.get(v.id) ?? []),
    }));

    // Prompt 19's "compare against a control group": when one variant is the experiment's
    // control, every other variant's lift is its own numbers minus the control's — the whole
    // reason to run a control group instead of just reading each variant's raw numbers.
    const control = variants.find((v) => v.isControl) ?? null;
    const experiment = control
      ? {
          controlVariantId: control.variantId,
          lift: variants
            .filter((v) => !v.isControl)
            .map((v) => {
              const revenuePerRecipient = v.targeted > 0 ? v.revenueAttributed.div(v.targeted) : new Decimal(0);
              const controlRevenuePerRecipient = control.targeted > 0 ? control.revenueAttributed.div(control.targeted) : new Decimal(0);
              return {
                variantId: v.variantId,
                conversionRateLift: Number((v.conversionRate - control.conversionRate).toFixed(2)),
                revenuePerRecipientLift: revenuePerRecipient.sub(controlRevenuePerRecipient).toDecimalPlaces(2),
              };
            }),
        }
      : null;

    return { ...totals, variants, experiment };
  }

  private summarizeRecipients(
    recipients: { message: { status: string } | null; skippedReason: string | null; convertedOrderId: string | null; attributedRevenue: Prisma.Decimal | null }[],
  ) {
    const targeted = recipients.length;
    const sent = recipients.filter((r) => r.message && r.message.status !== "SKIPPED").length;
    const delivered = recipients.filter((r) => r.message?.status === "DELIVERED").length;
    const failed = recipients.filter((r) => r.message?.status === "FAILED").length;
    const skipped = recipients.filter((r) => r.skippedReason || r.message?.status === "SKIPPED").length;
    const converted = recipients.filter((r) => r.convertedOrderId).length;
    const revenueAttributed = recipients.reduce((sum, r) => sum.add(r.attributedRevenue ?? new Decimal(0)), new Decimal(0));
    const conversionRate = targeted > 0 ? Number(((converted / targeted) * 100).toFixed(2)) : 0;
    return { targeted, sent, delivered, failed, skipped, converted, conversionRate, revenueAttributed };
  }
}
