import { z } from "zod";

export const communicationChannelSchema = z.enum(["WHATSAPP", "SMS"]);
export const communicationPurposeSchema = z.enum(["TRANSACTIONAL", "PROMOTIONAL"]);
export const communicationStatusSchema = z.enum([
  "QUEUED",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);

const KEY_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export const createCommunicationTemplateSchema = z.object({
  brandId: z.string().min(1).optional(),
  channel: communicationChannelSchema,
  purpose: communicationPurposeSchema,
  key: z.string().min(1).max(60).regex(KEY_RE, "must be lowercase snake_case, e.g. order_confirmation"),
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  providerTemplateName: z.string().max(120).optional(),
  providerSenderId: z.string().max(120).optional(),
});
export type CreateCommunicationTemplateDto = z.infer<typeof createCommunicationTemplateSchema>;

export const updateCommunicationTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(2000).optional(),
  providerTemplateName: z.string().max(120).nullable().optional(),
  providerSenderId: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCommunicationTemplateDto = z.infer<typeof updateCommunicationTemplateSchema>;

export const recordCommunicationConsentSchema = z.object({
  source: z.string().min(1).max(120),
});
export type RecordCommunicationConsentDto = z.infer<typeof recordCommunicationConsentSchema>;

export const optOutCommunicationSchema = z.object({
  scope: z.enum(["ALL", "MARKETING"]),
});
export type OptOutCommunicationDto = z.infer<typeof optOutCommunicationSchema>;

/**
 * Either `templateKey` (rendered against the customer's active template for that
 * channel/purpose) or a raw `body` must be given — enforced by the refine below, since a
 * message needs content from exactly one of those two sources, never neither nor both.
 */
export const sendCommunicationMessageSchema = z
  .object({
    customerId: z.string().min(1),
    channel: communicationChannelSchema,
    purpose: communicationPurposeSchema,
    templateKey: z.string().min(1).max(60).optional(),
    body: z.string().min(1).max(2000).optional(),
    variables: z.record(z.string(), z.string()).optional(),
    scheduledFor: z.coerce.date().optional(),
  })
  .refine((v) => Boolean(v.templateKey) !== Boolean(v.body), {
    message: "provide exactly one of templateKey or body",
    path: ["templateKey"],
  });
export type SendCommunicationMessageDto = z.infer<typeof sendCommunicationMessageSchema>;

export const communicationMessageFilterSchema = z.object({
  customerId: z.string().min(1).optional(),
  channel: communicationChannelSchema.optional(),
  purpose: communicationPurposeSchema.optional(),
  status: communicationStatusSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type CommunicationMessageFilterDto = z.infer<typeof communicationMessageFilterSchema>;
