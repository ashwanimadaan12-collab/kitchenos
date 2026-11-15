import { z } from "zod";
import { moneySchema, largeMoneySchema } from "./money.schemas.js";

export const promotionTypeSchema = z.enum(["PERCENTAGE", "FLAT"]);

export const createPromotionSchema = z
  .object({
    brandId: z.string().min(1).optional(),
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, "must be uppercase letters, digits, hyphens or underscores only"),
    description: z.string().max(500).optional(),
    type: promotionTypeSchema,
    value: moneySchema,
    minOrderSubtotal: largeMoneySchema.optional(),
    maxDiscountAmount: largeMoneySchema.optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    usageLimit: z.number().int().min(1).optional(),
  })
  .refine((v) => v.type !== "PERCENTAGE" || Number(v.value) <= 100, {
    message: "a PERCENTAGE value cannot exceed 100",
    path: ["value"],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreatePromotionDto = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z.object({
  description: z.string().max(500).optional(),
  value: moneySchema.optional(),
  minOrderSubtotal: largeMoneySchema.optional(),
  maxDiscountAmount: largeMoneySchema.optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePromotionDto = z.infer<typeof updatePromotionSchema>;

export const applyPromotionSchema = z.object({
  code: z.string().min(1).max(40),
});
export type ApplyPromotionDto = z.infer<typeof applyPromotionSchema>;
