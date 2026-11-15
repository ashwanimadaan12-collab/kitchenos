import { z } from "zod";
import { quantitySchema } from "./money.schemas.js";

const CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const ingredientKindSchema = z.enum(["RAW_MATERIAL", "PACKAGING"]);
export const unitOfMeasureSchema = z.enum(["GRAM", "KILOGRAM", "MILLILITRE", "LITRE", "UNIT", "DOZEN"]);

export const createIngredientSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(40).regex(CODE_RE, "SKU must be uppercase alphanumeric, e.g. ING-FLOUR-01"),
  kind: ingredientKindSchema.optional(),
  unit: unitOfMeasureSchema,
  preferredSupplierId: z.string().min(1).optional(),
  shelfLifeDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateIngredientDto = z.infer<typeof createIngredientSchema>;

export const updateIngredientSchema = createIngredientSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateIngredientDto = z.infer<typeof updateIngredientSchema>;

export const createRecipeSchema = z.object({
  variantId: z.string().min(1),
  preparationStationId: z.string().min(1).optional(),
  yieldQuantity: z.number().int().min(1).optional(),
  instructions: z.string().max(2000).optional(),
});
export type CreateRecipeDto = z.infer<typeof createRecipeSchema>;

export const updateRecipeSchema = createRecipeSchema
  .omit({ variantId: true })
  .partial()
  .extend({
    preparationStationId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  });
export type UpdateRecipeDto = z.infer<typeof updateRecipeSchema>;

export const addRecipeIngredientSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: quantitySchema,
});
export type AddRecipeIngredientDto = z.infer<typeof addRecipeIngredientSchema>;

export const updateRecipeIngredientSchema = z.object({
  quantity: quantitySchema,
});
export type UpdateRecipeIngredientDto = z.infer<typeof updateRecipeIngredientSchema>;
