import { z } from "zod";
import { moneySchema } from "./money.schemas.js";

const comboItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});

export const createComboSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  comboPrice: moneySchema,
  /** At least two components, otherwise it's just a priced variant, not a bundle. */
  items: z.array(comboItemSchema).min(2),
});
export type CreateComboDto = z.infer<typeof createComboSchema>;

export const addComboItemSchema = comboItemSchema;
export type AddComboItemDto = z.infer<typeof addComboItemSchema>;

export const updateComboItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});
export type UpdateComboItemDto = z.infer<typeof updateComboItemSchema>;

export const updateComboSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  comboPrice: moneySchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateComboDto = z.infer<typeof updateComboSchema>;

export const addComboToMenuSchema = z.object({
  comboId: z.string().min(1),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type AddComboToMenuDto = z.infer<typeof addComboToMenuSchema>;

export const addComboOrderItemSchema = z.object({
  comboId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});
export type AddComboOrderItemDto = z.infer<typeof addComboOrderItemSchema>;
