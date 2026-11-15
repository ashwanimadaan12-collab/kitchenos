import { z } from "zod";

/**
 * Loyalty rate fields are configuration, not a customer-submitted amount, but they're still
 * Decimal columns (earningRate/BrandLoyaltyRule.earningRate: Decimal(6,2); redemptionRatio/
 * BrandLoyaltyRule.redemptionRatio: Decimal(10,4); LoyaltyTier.earningMultiplier: Decimal(4,2)) —
 * validated as decimal strings sized to each column's precision, the same money.schemas.ts
 * discipline, so a value that passes here can never overflow on insert.
 */
const EARNING_RATE_RE = /^\d{1,4}(\.\d{1,2})?$/;
const REDEMPTION_RATIO_RE = /^\d{1,6}(\.\d{1,4})?$/;
const EARNING_MULTIPLIER_RE = /^\d{1,2}(\.\d{1,2})?$/;

const earningRateSchema = z.string().regex(EARNING_RATE_RE, "must be a non-negative rate with up to 2 decimal places");
const redemptionRatioSchema = z
  .string()
  .regex(REDEMPTION_RATIO_RE, "must be a non-negative amount with up to 4 decimal places");
const earningMultiplierSchema = z
  .string()
  .regex(EARNING_MULTIPLIER_RE, "must be a non-negative multiplier with up to 2 decimal places");

export const updateLoyaltyProgramSettingsSchema = z.object({
  earningRate: earningRateSchema.optional(),
  redemptionRatio: redemptionRatioSchema.optional(),
  welcomeBonusPoints: z.number().int().min(0).optional(),
  referralBonusPoints: z.number().int().min(0).optional(),
  birthdayBonusPoints: z.number().int().min(0).optional(),
  pointsExpiryDays: z.number().int().min(1).nullable().optional(),
});
export type UpdateLoyaltyProgramSettingsDto = z.infer<typeof updateLoyaltyProgramSettingsSchema>;

export const createLoyaltyTierSchema = z.object({
  name: z.string().min(1).max(60),
  minLifetimePoints: z.number().int().min(0),
  earningMultiplier: earningMultiplierSchema.default("1"),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateLoyaltyTierDto = z.infer<typeof createLoyaltyTierSchema>;

export const updateLoyaltyTierSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  minLifetimePoints: z.number().int().min(0).optional(),
  earningMultiplier: earningMultiplierSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateLoyaltyTierDto = z.infer<typeof updateLoyaltyTierSchema>;

export const upsertBrandLoyaltyRuleSchema = z.object({
  earningRate: earningRateSchema.nullable().optional(),
  redemptionRatio: redemptionRatioSchema.nullable().optional(),
});
export type UpsertBrandLoyaltyRuleDto = z.infer<typeof upsertBrandLoyaltyRuleSchema>;

export const redeemLoyaltyPointsSchema = z.object({
  points: z.number().int().min(1),
});
export type RedeemLoyaltyPointsDto = z.infer<typeof redeemLoyaltyPointsSchema>;

export const manualLoyaltyAdjustmentSchema = z.object({
  points: z.number().int().refine((v) => v !== 0, "points must not be zero"),
  note: z.string().min(1).max(500),
});
export type ManualLoyaltyAdjustmentDto = z.infer<typeof manualLoyaltyAdjustmentSchema>;

export const loyaltyTransactionFilterSchema = z.object({
  type: z
    .enum([
      "EARN",
      "REDEEM",
      "EXPIRE",
      "WELCOME_BONUS",
      "BIRTHDAY_BONUS",
      "REFERRAL_BONUS",
      "REDEMPTION_REVERSAL",
      "MANUAL_ADJUSTMENT",
    ])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type LoyaltyTransactionFilterDto = z.infer<typeof loyaltyTransactionFilterSchema>;
