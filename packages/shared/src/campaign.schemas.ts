import { z } from "zod";
import { largeMoneySchema } from "./money.schemas.js";

export const campaignSegmentTypeSchema = z.enum([
  "ALL",
  "INACTIVE",
  "REPEAT",
  "BRAND_PREFERENCE",
  "TOTAL_SPEND",
  "LOYALTY_TIER",
  "BIRTHDAY_THIS_WEEK",
]);

const segmentName = z.string().min(1).max(120);

/**
 * A discriminated union so each segment type carries exactly the criteria field it needs —
 * e.g. INACTIVE requires `inactiveDays`, ALL and BIRTHDAY_THIS_WEEK need no criteria at all.
 */
export const createCustomerSegmentSchema = z.discriminatedUnion("type", [
  z.object({ name: segmentName, type: z.literal("ALL") }),
  z.object({ name: segmentName, type: z.literal("INACTIVE"), inactiveDays: z.number().int().min(1).max(3650) }),
  z.object({ name: segmentName, type: z.literal("REPEAT"), minOrders: z.number().int().min(1).max(100000) }),
  z.object({ name: segmentName, type: z.literal("BRAND_PREFERENCE"), brandId: z.string().min(1) }),
  z.object({ name: segmentName, type: z.literal("TOTAL_SPEND"), minSpend: largeMoneySchema }),
  z.object({ name: segmentName, type: z.literal("LOYALTY_TIER"), loyaltyTierId: z.string().min(1) }),
  z.object({ name: segmentName, type: z.literal("BIRTHDAY_THIS_WEEK") }),
]);
export type CreateCustomerSegmentDto = z.infer<typeof createCustomerSegmentSchema>;

export const updateCustomerSegmentSchema = z.object({
  name: segmentName.optional(),
  inactiveDays: z.number().int().min(1).max(3650).optional(),
  minOrders: z.number().int().min(1).max(100000).optional(),
  brandId: z.string().min(1).optional(),
  minSpend: largeMoneySchema.optional(),
  loyaltyTierId: z.string().min(1).optional(),
});
export type UpdateCustomerSegmentDto = z.infer<typeof updateCustomerSegmentSchema>;

export const campaignTypeSchema = z.enum([
  "MONDAY_SPECIAL",
  "WEEKEND_COMBO",
  "BIRTHDAY_PROMOTION",
  "WIN_BACK",
  "NEW_PRODUCT_LAUNCH",
  "LOYALTY_MILESTONE",
  "CUSTOM",
]);

/**
 * `templateId` is required unless `isControl` — a control-group variant (Prompt 19's
 * controlled-experiment support) deliberately sends no message, so it has nothing to template.
 */
const campaignVariantInputSchema = z
  .object({
    name: z.string().min(1).max(40),
    templateId: z.string().min(1).optional(),
    trafficPercent: z.number().int().min(1).max(100),
    isControl: z.boolean().optional(),
  })
  .refine((v) => v.isControl || Boolean(v.templateId), {
    message: "templateId is required unless the variant is a control group",
    path: ["templateId"],
  });

export const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(160),
    type: campaignTypeSchema,
    segmentId: z.string().min(1),
    scheduledFor: z.coerce.date().optional(),
    budgetAmount: largeMoneySchema.optional(),
    conversionWindowDays: z.number().int().min(1).max(90).default(7),
    variants: z.array(campaignVariantInputSchema).min(1).max(5),
  })
  .refine((v) => new Set(v.variants.map((variant) => variant.name)).size === v.variants.length, {
    message: "variant names must be unique within a campaign",
    path: ["variants"],
  })
  .refine((v) => v.variants.reduce((sum, variant) => sum + variant.trafficPercent, 0) === 100, {
    message: "variant trafficPercent values must sum to 100",
    path: ["variants"],
  })
  .refine((v) => v.variants.filter((variant) => variant.isControl).length <= 1, {
    message: "a campaign can have at most one control-group variant",
    path: ["variants"],
  });
export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;

export const campaignFilterSchema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED"]).optional(),
  type: campaignTypeSchema.optional(),
});
export type CampaignFilterDto = z.infer<typeof campaignFilterSchema>;
