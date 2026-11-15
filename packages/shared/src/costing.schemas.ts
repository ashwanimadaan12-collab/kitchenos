import { z } from "zod";
import { costSchema, moneySchema } from "./money.schemas.js";

export const setIngredientCostSchema = z.object({
  costPerUnit: costSchema,
});
export type SetIngredientCostDto = z.infer<typeof setIngredientCostSchema>;

export const createRecipeOverheadCostSchema = z.object({
  label: z.string().min(1).max(60),
  amount: moneySchema,
});
export type CreateRecipeOverheadCostDto = z.infer<typeof createRecipeOverheadCostSchema>;

export const updateRecipeOverheadCostSchema = createRecipeOverheadCostSchema.partial();
export type UpdateRecipeOverheadCostDto = z.infer<typeof updateRecipeOverheadCostSchema>;
