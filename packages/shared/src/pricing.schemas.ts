import { z } from "zod";
import { moneySchema } from "./money.schemas.js";
import { orderChannelSchema } from "./pos.schemas.js";

export const pricingRuleCategorySchema = z.enum([
  "TIME_BASED",
  "WEEKEND",
  "FESTIVAL",
  "CHANNEL",
  "OUTLET",
  "SCHEDULED_DISCOUNT",
  "DEMAND_BASED",
]);

export const pricingAdjustmentTypeSchema = z.enum([
  "FIXED_PRICE",
  "PERCENT_DISCOUNT",
  "FLAT_DISCOUNT",
  "PERCENT_SURCHARGE",
  "FLAT_SURCHARGE",
]);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeOfDaySchema = z.string().regex(TIME_RE, "must be 24-hour HH:mm");

const PERCENT_RE = /^(\d{1,2}(\.\d{1,2})?|100(\.0{1,2})?)$/;
const percentSchema = z.string().regex(PERCENT_RE, "must be a percentage between 0 and 100");

const pricingRuleShape = {
  variantId: z.string().min(1).optional(),
  outletId: z.string().min(1).optional(),
  channel: orderChannelSchema.optional(),
  category: pricingRuleCategorySchema,
  label: z.string().min(1).max(120),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startTime: timeOfDaySchema.optional(),
  endTime: timeOfDaySchema.optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  adjustmentType: pricingAdjustmentTypeSchema,
  adjustmentValue: moneySchema,
  priority: z.number().int().min(0).max(1000).default(0),
  /** Confirms a discount that would price a variant below the org's configured minimum-margin
   *  floor is intentional — Prompt 19's margin safeguard. Not itself persisted on the rule. */
  approvedOverride: z.boolean().optional(),
};

export const createPricingRuleSchema = z
  .object(pricingRuleShape)
  .refine((v) => !(v.validFrom && v.validTo) || v.validFrom <= v.validTo, {
    message: "validFrom must be on or before validTo",
    path: ["validTo"],
  })
  .refine((v) => (v.adjustmentType === "PERCENT_DISCOUNT" || v.adjustmentType === "PERCENT_SURCHARGE" ? Number(v.adjustmentValue) <= 100 : true), {
    message: "a percent adjustment cannot exceed 100",
    path: ["adjustmentValue"],
  });
export type CreatePricingRuleDto = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = z
  .object({
    variantId: z.string().min(1).nullable().optional(),
    outletId: z.string().min(1).nullable().optional(),
    channel: orderChannelSchema.nullable().optional(),
    category: pricingRuleCategorySchema.optional(),
    label: z.string().min(1).max(120).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    startTime: timeOfDaySchema.nullable().optional(),
    endTime: timeOfDaySchema.nullable().optional(),
    validFrom: z.coerce.date().nullable().optional(),
    validTo: z.coerce.date().nullable().optional(),
    adjustmentType: pricingAdjustmentTypeSchema.optional(),
    adjustmentValue: moneySchema.optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    isActive: z.boolean().optional(),
    approvedOverride: z.boolean().optional(),
  })
  .refine((v) => !(v.validFrom && v.validTo) || v.validFrom <= v.validTo, {
    message: "validFrom must be on or before validTo",
    path: ["validTo"],
  });
export type UpdatePricingRuleDto = z.infer<typeof updatePricingRuleSchema>;

export const updatePricingSettingsSchema = z.object({
  minimumMarginPercent: percentSchema,
});
export type UpdatePricingSettingsDto = z.infer<typeof updatePricingSettingsSchema>;

export const priceQuoteQuerySchema = z.object({
  variantId: z.string().min(1),
  outletId: z.string().min(1),
  channel: orderChannelSchema,
  at: z.coerce.date().optional(),
});
export type PriceQuoteQueryDto = z.infer<typeof priceQuoteQuerySchema>;
