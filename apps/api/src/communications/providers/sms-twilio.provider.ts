import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import {
  CommunicationProviderError,
  type CommunicationProviderAdapter,
  type SendCommunicationInput,
  type SendCommunicationResult,
} from "./communication-provider.js";

/**
 * Real integration with Twilio's SMS REST API. Unlike WhatsApp, SMS has no template-approval
 * requirement, so this always sends the rendered `body` text directly.
 *
 * Without SMS_TWILIO_ACCOUNT_SID/SMS_TWILIO_AUTH_TOKEN configured, send() throws a clear
 * CommunicationProviderError instead of attempting a call, same soft-fail contract as the
 * WhatsApp adapter.
 */
@Injectable()
export class SmsTwilioProvider implements CommunicationProviderAdapter {
  readonly channel = "SMS" as const;
  private readonly logger = new Logger(SmsTwilioProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(input: SendCommunicationInput): Promise<SendCommunicationResult> {
    const accountSid = this.config.get("SMS_TWILIO_ACCOUNT_SID", { infer: true });
    const authToken = this.config.get("SMS_TWILIO_AUTH_TOKEN", { infer: true });
    const defaultFromNumber = this.config.get("SMS_TWILIO_FROM_NUMBER", { infer: true });
    const fromNumber = input.senderOverride ?? defaultFromNumber;
    if (!accountSid || !authToken || !fromNumber) {
      throw new CommunicationProviderError("SMS provider is not configured (missing account sid, auth token or from number)");
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const form = new URLSearchParams({ To: input.to, From: fromNumber, Body: input.body });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
    } catch (err) {
      this.logger.error(`SMS send to "${input.to}" failed to reach the provider`, err);
      throw new CommunicationProviderError("Could not reach the Twilio API");
    }

    const payload = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;

    if (!response.ok || !payload?.sid) {
      const reason = payload?.message ?? `HTTP ${response.status}`;
      throw new CommunicationProviderError(`Twilio rejected the message: ${reason}`);
    }

    return { providerMessageId: payload.sid };
  }
}
