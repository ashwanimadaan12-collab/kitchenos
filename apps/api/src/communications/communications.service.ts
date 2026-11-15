import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaService, type CommunicationChannel, type CommunicationMessage, type CommunicationPurpose } from "@kitchenos/database";
import type {
  CommunicationMessageFilterDto,
  CreateCommunicationTemplateDto,
  OptOutCommunicationDto,
  RecordCommunicationConsentDto,
  SendCommunicationMessageDto,
  UpdateCommunicationTemplateDto,
} from "@kitchenos/shared";
import { assertBelongsToOrg } from "../common/utils/assert-belongs-to-org.js";
import { CommunicationProviderError, type CommunicationProviderAdapter } from "./providers/communication-provider.js";
import { WhatsAppCloudProvider } from "./providers/whatsapp-cloud.provider.js";
import { SmsTwilioProvider } from "./providers/sms-twilio.provider.js";

const PROVIDER_NAMES: Record<CommunicationChannel, string> = {
  WHATSAPP: "whatsapp_cloud",
  SMS: "twilio_sms",
};

interface QueueMessageInput {
  organizationId: string;
  customerId: string;
  toAddress: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  body: string;
  templateId?: string | null;
  providerTemplateName?: string | null;
  providerSenderId?: string | null;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

/** Order-confirmation/status-notification callers pass only what they already have loaded. */
export interface OrderForCommunication {
  id: string;
  orderNumber: number;
  status: string;
  total: Prisma.Decimal;
  customerId: string | null;
  customer: { id: string; phone: string; loyaltyPoints: number } | null;
  outlet: { name: string; brandId: string; brand: { name: string } };
  items: { status: string; productName: string; quantity: number }[];
}

@Injectable()
export class CommunicationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunicationsService.name);
  private readonly providers: Record<CommunicationChannel, CommunicationProviderAdapter>;
  private dispatchTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    whatsapp: WhatsAppCloudProvider,
    sms: SmsTwilioProvider,
  ) {
    this.providers = { WHATSAPP: whatsapp, SMS: sms };
  }

  /**
   * Stand-in for a durable job queue (the real BullMQ/cron a production deployment would use —
   * out of scope for this milestone, since it's an infra choice independent of the communication
   * domain logic itself). Polling every 30s is enough to prove scheduling/dispatch actually
   * works end to end. Skipped under Jest so test runs don't leave a dangling open handle.
   */
  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID) return;
    this.dispatchTimer = setInterval(() => {
      this.dispatchDue().catch((err) => this.logger.error("Scheduled dispatch pass failed", err));
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
  }

  // ---------------------------------------------------------------- Templates

  async listTemplates(organizationId: string, filters: { channel?: CommunicationChannel; brandId?: string } = {}) {
    return this.prisma.communicationTemplate.findMany({
      where: { organizationId, ...(filters.channel ? { channel: filters.channel } : {}), ...(filters.brandId ? { brandId: filters.brandId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { brand: { select: { name: true } } },
    });
  }

  async createTemplate(organizationId: string, dto: CreateCommunicationTemplateDto) {
    if (dto.brandId) {
      await assertBelongsToOrg(
        () => this.prisma.brand.findFirst({ where: { id: dto.brandId, organizationId } }),
        "Brand",
      );
    } else {
      // The DB's (organizationId, brandId, channel, key) unique index can't portably express
      // "unique while brandId IS NULL" in Prisma's schema syntax (Postgres treats two NULLs as
      // distinct), so the org-wide-template case is guarded here instead — same pattern as the
      // Attendance "at most one open clock-in" rule.
      const existing = await this.prisma.communicationTemplate.findFirst({
        where: { organizationId, brandId: null, channel: dto.channel, key: dto.key },
      });
      if (existing) {
        throw new ConflictException("A template with this key already exists for this channel");
      }
    }
    try {
      return await this.prisma.communicationTemplate.create({
        data: { organizationId, ...dto },
        include: { brand: { select: { name: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("A template with this key already exists for this channel");
      }
      throw err;
    }
  }

  async updateTemplate(organizationId: string, id: string, dto: UpdateCommunicationTemplateDto) {
    await assertBelongsToOrg(
      () => this.prisma.communicationTemplate.findFirst({ where: { id, organizationId } }),
      "Communication template",
    );
    return this.prisma.communicationTemplate.update({
      where: { id },
      data: dto,
      include: { brand: { select: { name: true } } },
    });
  }

  /** Brand-specific templates take priority over the organization-wide default (brandId: null). */
  private async findActiveTemplate(organizationId: string, channel: CommunicationChannel, key: string, brandId?: string | null) {
    if (brandId) {
      const specific = await this.prisma.communicationTemplate.findFirst({
        where: { organizationId, channel, key, brandId, isActive: true },
      });
      if (specific) return specific;
    }
    return this.prisma.communicationTemplate.findFirst({
      where: { organizationId, channel, key, brandId: null, isActive: true },
    });
  }

  /** Tries WHATSAPP first (the spec's primary channel), falling back to SMS. */
  private async findActiveTemplateOnAnyChannel(organizationId: string, key: string, brandId?: string | null) {
    for (const channel of ["WHATSAPP", "SMS"] as const) {
      const template = await this.findActiveTemplate(organizationId, channel, key, brandId);
      if (template) return { channel, template };
    }
    return null;
  }

  private renderBody(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => variables[key] ?? match);
  }

  // ------------------------------------------------------------- Preferences

  async listPreferences(organizationId: string, customerId: string) {
    await assertBelongsToOrg(() => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }), "Customer");
    return this.prisma.customerCommunicationPreference.findMany({ where: { customerId } });
  }

  async recordConsent(
    organizationId: string,
    customerId: string,
    channel: CommunicationChannel,
    dto: RecordCommunicationConsentDto,
    userId: string,
  ) {
    await assertBelongsToOrg(() => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }), "Customer");
    return this.prisma.customerCommunicationPreference.upsert({
      where: { customerId_channel: { customerId, channel } },
      create: {
        customerId,
        channel,
        marketingOptIn: true,
        consentSource: dto.source,
        consentGivenAt: new Date(),
        consentGivenByUserId: userId,
      },
      update: {
        marketingOptIn: true,
        consentSource: dto.source,
        consentGivenAt: new Date(),
        consentGivenByUserId: userId,
        optedOutAt: null,
      },
    });
  }

  async optOut(organizationId: string, customerId: string, channel: CommunicationChannel, dto: OptOutCommunicationDto) {
    await assertBelongsToOrg(() => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }), "Customer");
    const data = {
      marketingOptIn: false,
      optedOutAt: new Date(),
      ...(dto.scope === "ALL" ? { transactionalOptIn: false } : {}),
    };
    return this.prisma.customerCommunicationPreference.upsert({
      where: { customerId_channel: { customerId, channel } },
      create: { customerId, channel, ...data },
      update: data,
    });
  }

  // ----------------------------------------------------------------- Sending

  /** Ad-hoc send/schedule, validated against the caller-supplied DTO. */
  async sendMessage(organizationId: string, dto: SendCommunicationMessageDto): Promise<CommunicationMessage> {
    const customer = await assertBelongsToOrg(
      () => this.prisma.customer.findFirst({ where: { id: dto.customerId, organizationId } }),
      "Customer",
    );

    let templateId: string | undefined;
    let providerTemplateName: string | null | undefined;
    let providerSenderId: string | null | undefined;
    let body: string;
    if (dto.templateKey) {
      const template = await this.findActiveTemplate(organizationId, dto.channel, dto.templateKey);
      if (!template) {
        throw new NotFoundException(`No active ${dto.channel} template found for key "${dto.templateKey}"`);
      }
      body = this.renderBody(template.body, dto.variables ?? {});
      templateId = template.id;
      providerTemplateName = template.providerTemplateName;
      providerSenderId = template.providerSenderId;
    } else {
      body = dto.body!;
    }

    return this.queueMessage({
      organizationId,
      customerId: customer.id,
      toAddress: customer.phone,
      channel: dto.channel,
      purpose: dto.purpose,
      body,
      templateId,
      providerTemplateName,
      providerSenderId,
      scheduledFor: dto.scheduledFor,
    });
  }

  /**
   * Sends using one specific, already-chosen template row rather than looking one up by
   * (channel, key) convention — used by campaigns, which pick one of several template
   * *variants* for a customer (e.g. for A/B testing) rather than "the" template for a key.
   * Reuses the same consent-check/queue/dispatch path as every other send in this service.
   */
  async sendUsingTemplateId(
    organizationId: string,
    customerId: string,
    templateId: string,
    purpose: CommunicationPurpose,
    variables: Record<string, string> = {},
    metadata?: Record<string, unknown>,
  ): Promise<CommunicationMessage> {
    const customer = await assertBelongsToOrg(
      () => this.prisma.customer.findFirst({ where: { id: customerId, organizationId } }),
      "Customer",
    );
    const template = await assertBelongsToOrg(
      () => this.prisma.communicationTemplate.findFirst({ where: { id: templateId, organizationId } }),
      "Communication template",
    );
    return this.queueMessage({
      organizationId,
      customerId: customer.id,
      toAddress: customer.phone,
      channel: template.channel,
      purpose,
      body: this.renderBody(template.body, variables),
      templateId: template.id,
      providerTemplateName: template.providerTemplateName,
      providerSenderId: template.providerSenderId,
      metadata,
    });
  }

  /** Best-effort order-confirmation send — never throws into the caller's order flow. */
  async sendOrderConfirmation(organizationId: string, order: OrderForCommunication): Promise<void> {
    await this.sendOrderEvent(organizationId, order, "order_confirmation");
  }

  /** Best-effort order-status-change send (e.g. void) — only fires if a template is configured for that key. */
  async sendOrderStatusNotification(organizationId: string, order: OrderForCommunication): Promise<void> {
    await this.sendOrderEvent(organizationId, order, "order_status_update");
  }

  private async sendOrderEvent(organizationId: string, order: OrderForCommunication, templateKey: string): Promise<void> {
    if (!order.customerId || !order.customer) return;
    try {
      const picked = await this.findActiveTemplateOnAnyChannel(organizationId, templateKey, order.outlet.brandId);
      if (!picked) {
        this.logger.debug(`No active "${templateKey}" template configured for org "${organizationId}"; skipping`);
        return;
      }
      const itemsSummary =
        order.items.filter((i) => i.status === "ACTIVE").map((i) => `${i.quantity}x ${i.productName}`).join(", ") || "—";
      const variables = {
        brand: order.outlet.brand.name,
        outlet: order.outlet.name,
        orderNumber: String(order.orderNumber),
        items: itemsSummary,
        total: order.total.toFixed(2),
        paymentStatus: order.status,
        loyaltyPoints: String(order.customer.loyaltyPoints),
      };
      await this.queueMessage({
        organizationId,
        customerId: order.customerId,
        toAddress: order.customer.phone,
        channel: picked.channel,
        purpose: "TRANSACTIONAL",
        body: this.renderBody(picked.template.body, variables),
        templateId: picked.template.id,
        providerTemplateName: picked.template.providerTemplateName,
        providerSenderId: picked.template.providerSenderId,
        metadata: { orderId: order.id, templateKey },
      });
    } catch (err) {
      this.logger.error(`Failed to send "${templateKey}" for order "${order.id}"`, err);
    }
  }

  private async queueMessage(input: QueueMessageInput): Promise<CommunicationMessage> {
    const preference = await this.prisma.customerCommunicationPreference.findUnique({
      where: { customerId_channel: { customerId: input.customerId, channel: input.channel } },
    });

    const blockedReason =
      input.purpose === "PROMOTIONAL"
        ? !preference?.marketingOptIn
          ? "Customer has not consented to marketing messages on this channel"
          : null
        : preference?.transactionalOptIn === false
          ? "Customer has opted out of all messages on this channel"
          : null;

    if (blockedReason) {
      return this.prisma.communicationMessage.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          templateId: input.templateId,
          channel: input.channel,
          purpose: input.purpose,
          toAddress: input.toAddress,
          body: input.body,
          status: "SKIPPED",
          failureReason: blockedReason,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    }

    const scheduledFor = input.scheduledFor && input.scheduledFor.getTime() > Date.now() ? input.scheduledFor : null;
    const message = await this.prisma.communicationMessage.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        templateId: input.templateId,
        channel: input.channel,
        purpose: input.purpose,
        toAddress: input.toAddress,
        body: input.body,
        status: scheduledFor ? "SCHEDULED" : "QUEUED",
        scheduledFor,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    if (scheduledFor) return message;
    return this.dispatch(message, input.providerTemplateName, input.providerSenderId);
  }

  private async dispatch(
    message: CommunicationMessage,
    providerTemplateName?: string | null,
    providerSenderId?: string | null,
  ): Promise<CommunicationMessage> {
    const provider = this.providers[message.channel];
    try {
      const result = await provider.send({
        to: message.toAddress,
        body: message.body,
        providerTemplateName,
        senderOverride: providerSenderId,
      });
      return this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          providerName: PROVIDER_NAMES[message.channel],
        },
      });
    } catch (err) {
      const reason = err instanceof CommunicationProviderError ? err.message : "Unexpected error sending message";
      this.logger.error(`Failed to send ${message.channel} message "${message.id}"`, err);
      return this.prisma.communicationMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", failedAt: new Date(), failureReason: reason, retryCount: { increment: 1 } },
      });
    }
  }

  async retryMessage(organizationId: string, id: string): Promise<CommunicationMessage> {
    const message = await assertBelongsToOrg(
      () => this.prisma.communicationMessage.findFirst({ where: { id, organizationId }, include: { template: true } }),
      "Communication message",
    );
    if (message.status !== "FAILED") {
      throw new ConflictException(`Message is ${message.status.toLowerCase()}, not failed`);
    }
    return this.dispatch(message, message.template?.providerTemplateName, message.template?.providerSenderId);
  }

  /**
   * Picked up by the interval timer in onModuleInit, and also callable directly (manual
   * trigger endpoint, or a test) — scoped to one organization when given, otherwise every
   * organization's due messages. QUEUED rows with no scheduledFor are included too, so a
   * message that was queued right as the process crashed still gets picked up on the next pass.
   */
  async dispatchDue(organizationId?: string): Promise<number> {
    const due = await this.prisma.communicationMessage.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        OR: [{ status: "QUEUED" }, { status: "SCHEDULED", scheduledFor: { lte: new Date() } }],
      },
      include: { template: true },
      take: 50,
    });

    for (const message of due) {
      try {
        await this.dispatch(message, message.template?.providerTemplateName, message.template?.providerSenderId);
      } catch (err) {
        this.logger.error(`Unexpected error dispatching message "${message.id}"`, err);
      }
    }
    return due.length;
  }

  // ---------------------------------------------------------------- History

  async listMessages(organizationId: string, filters: CommunicationMessageFilterDto) {
    return this.prisma.communicationMessage.findMany({
      where: {
        organizationId,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.purpose ? { purpose: filters.purpose } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to
          ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  // -------------------------------------------------------- Delivery webhooks

  async markDeliveredByProviderMessageId(providerMessageId: string, status: "DELIVERED" | "FAILED", failureReason?: string): Promise<void> {
    await this.prisma.communicationMessage.updateMany({
      where: { providerMessageId },
      data: status === "DELIVERED" ? { status: "DELIVERED", deliveredAt: new Date() } : { status: "FAILED", failedAt: new Date(), failureReason },
    });
  }
}
