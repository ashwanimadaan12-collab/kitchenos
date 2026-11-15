import type { CommunicationChannel } from "@kitchenos/database";

export interface SendCommunicationInput {
  /** E.164-ish destination address — a phone number for both WhatsApp and SMS. */
  to: string;
  /** Rendered message text, kept for history/SMS even when the provider itself sends by template. */
  body: string;
  /** The provider-registered template name (WhatsApp Business Platform only delivers approved templates). */
  providerTemplateName?: string | null;
  /** Per-brand sender override (phone number ID / "from" number) — null means use the configured default. */
  senderOverride?: string | null;
}

export interface SendCommunicationResult {
  providerMessageId: string;
}

/** Thrown by an adapter when the send itself fails (network error, provider rejection, or missing config). */
export class CommunicationProviderError extends Error {}

/**
 * Provider abstraction every channel adapter implements, so CommunicationsService never
 * depends on WhatsApp's or Twilio's wire format directly — adding a new SMS/WhatsApp provider
 * later only means writing a new adapter for this same interface.
 */
export interface CommunicationProviderAdapter {
  readonly channel: CommunicationChannel;
  send(input: SendCommunicationInput): Promise<SendCommunicationResult>;
}
