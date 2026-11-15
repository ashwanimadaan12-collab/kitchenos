import { Controller, Get, Headers, HttpCode, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator.js";
import type { Env } from "../config/env.schema.js";
import { CommunicationsService } from "./communications.service.js";
import { verifyTwilioSignature, verifyWhatsAppSignature } from "./webhook-signature.util.js";

interface WhatsAppStatusPayload {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
      };
    }[];
  }[];
}

/**
 * Receives delivery-status callbacks from the providers themselves — unauthenticated by
 * design (the provider, not a logged-in staff member, calls these), so every request is
 * instead authenticated by verifying the provider's own signature/verify-token. An unverified
 * or unconfigured request is rejected rather than trusted.
 */
@Controller({ path: "communications/webhooks", version: "1" })
export class CommunicationWebhooksController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get("whatsapp")
  @Public()
  verifyWhatsAppSubscription(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string,
  ): string {
    const expected = this.config.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", { infer: true });
    if (mode !== "subscribe" || !expected || verifyToken !== expected) {
      throw new UnauthorizedException("Invalid webhook verification request");
    }
    return challenge ?? "";
  }

  @Post("whatsapp")
  @Public()
  @HttpCode(200)
  async receiveWhatsAppStatus(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature?: string,
  ): Promise<{ received: boolean }> {
    const appSecret = this.config.get("WHATSAPP_APP_SECRET", { infer: true });
    if (!appSecret || !req.rawBody || !verifyWhatsAppSignature(req.rawBody.toString("utf8"), signature, appSecret)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    const payload = req.body as WhatsAppStatusPayload;
    const statuses = payload.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.statuses ?? []) ?? [];
    for (const status of statuses) {
      if (status.status === "delivered" || status.status === "read") {
        await this.communications.markDeliveredByProviderMessageId(status.id, "DELIVERED");
      } else if (status.status === "failed") {
        await this.communications.markDeliveredByProviderMessageId(status.id, "FAILED", status.errors?.[0]?.title);
      }
    }
    return { received: true };
  }

  @Post("sms")
  @Public()
  @HttpCode(200)
  async receiveSmsStatus(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-twilio-signature") signature?: string,
  ): Promise<{ received: boolean }> {
    const authToken = this.config.get("SMS_TWILIO_AUTH_TOKEN", { infer: true });
    const params = req.body as Record<string, string>;
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    if (!authToken || !verifyTwilioSignature(url, params, signature, authToken)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    const messageSid = params.MessageSid;
    const messageStatus = params.MessageStatus;
    if (messageSid && (messageStatus === "delivered" || messageStatus === "read")) {
      await this.communications.markDeliveredByProviderMessageId(messageSid, "DELIVERED");
    } else if (messageSid && (messageStatus === "failed" || messageStatus === "undelivered")) {
      await this.communications.markDeliveredByProviderMessageId(messageSid, "FAILED", params.ErrorMessage);
    }
    return { received: true };
  }
}
