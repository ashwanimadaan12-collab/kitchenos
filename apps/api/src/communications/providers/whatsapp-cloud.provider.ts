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
 * Real integration with Meta's WhatsApp Business Platform (Cloud API). WhatsApp only delivers
 * pre-approved template messages, so this always sends `type: "template"` referencing
 * `providerTemplateName` rather than the free-form rendered body (the body is still kept on
 * the CommunicationMessage row for history/audit, matching what the template renders to).
 *
 * Without WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID configured, send() throws a clear
 * CommunicationProviderError instead of attempting a call — the caller (CommunicationsService)
 * catches this and records the message as FAILED, so a missing integration never crashes the
 * app or blocks the order flow it was triggered from.
 */
@Injectable()
export class WhatsAppCloudProvider implements CommunicationProviderAdapter {
  readonly channel = "WHATSAPP" as const;
  private readonly logger = new Logger(WhatsAppCloudProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(input: SendCommunicationInput): Promise<SendCommunicationResult> {
    const accessToken = this.config.get("WHATSAPP_ACCESS_TOKEN", { infer: true });
    const defaultPhoneNumberId = this.config.get("WHATSAPP_PHONE_NUMBER_ID", { infer: true });
    const phoneNumberId = input.senderOverride ?? defaultPhoneNumberId;
    if (!accessToken || !phoneNumberId) {
      throw new CommunicationProviderError("WhatsApp provider is not configured (missing access token or phone number id)");
    }
    if (!input.providerTemplateName) {
      throw new CommunicationProviderError("WhatsApp requires an approved providerTemplateName — no template registered");
    }

    const apiVersion = this.config.get("WHATSAPP_GRAPH_API_VERSION", { infer: true });
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "template",
          template: { name: input.providerTemplateName, language: { code: "en" } },
        }),
      });
    } catch (err) {
      this.logger.error(`WhatsApp send to "${input.to}" failed to reach the provider`, err);
      throw new CommunicationProviderError("Could not reach the WhatsApp Cloud API");
    }

    const payload = (await response.json().catch(() => null)) as
      | { messages?: { id: string }[]; error?: { message?: string } }
      | null;

    if (!response.ok || !payload?.messages?.[0]?.id) {
      const reason = payload?.error?.message ?? `HTTP ${response.status}`;
      throw new CommunicationProviderError(`WhatsApp Cloud API rejected the message: ${reason}`);
    }

    return { providerMessageId: payload.messages[0].id };
  }
}
