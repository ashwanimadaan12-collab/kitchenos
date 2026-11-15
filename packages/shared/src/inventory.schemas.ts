import { z } from "zod";
import { quantitySchema, largeQuantitySchema, signedLargeQuantitySchema, costSchema } from "./money.schemas.js";

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(120).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;

const createPurchaseOrderItemSchema = z.object({
  ingredientId: z.string().min(1),
  quantityOrdered: quantitySchema,
  unitCost: costSchema,
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  kitchenId: z.string().min(1),
  items: z.array(createPurchaseOrderItemSchema).min(1),
});
export type CreatePurchaseOrderDto = z.infer<typeof createPurchaseOrderSchema>;

export const receivePurchaseOrderItemSchema = z.object({
  quantity: quantitySchema,
});
export type ReceivePurchaseOrderItemDto = z.infer<typeof receivePurchaseOrderItemSchema>;

export const stockAdjustmentTypeSchema = z.enum(["ADJUSTMENT", "WASTAGE"]);

export const adjustStockSchema = z.object({
  ingredientId: z.string().min(1),
  type: stockAdjustmentTypeSchema,
  quantityDelta: signedLargeQuantitySchema,
  note: z.string().max(500).optional(),
});
export type AdjustStockDto = z.infer<typeof adjustStockSchema>;

export const setReorderPointSchema = z.object({
  ingredientId: z.string().min(1),
  reorderPoint: largeQuantitySchema.nullable(),
});
export type SetReorderPointDto = z.infer<typeof setReorderPointSchema>;

export const forecastHorizonDaysSchema = z.coerce.number().int().refine((v) => v === 7 || v === 14 || v === 30, {
  message: "horizonDays must be 7, 14, or 30",
});

export const ingredientForecastQuerySchema = z.object({
  horizonDays: forecastHorizonDaysSchema.optional(),
});
export type IngredientForecastQueryDto = z.infer<typeof ingredientForecastQuerySchema>;

export const productForecastQuerySchema = z.object({
  outletId: z.string().min(1).optional(),
  horizonDays: forecastHorizonDaysSchema.optional(),
});
export type ProductForecastQueryDto = z.infer<typeof productForecastQuerySchema>;

export const setForecastOverrideSchema = z.object({
  safetyStockOverride: largeQuantitySchema.nullable().optional(),
  leadTimeDaysOverride: z.number().int().min(0).max(365).nullable().optional(),
});
export type SetForecastOverrideDto = z.infer<typeof setForecastOverrideSchema>;
