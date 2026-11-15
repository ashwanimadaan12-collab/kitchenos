import { z } from "zod";
import { largeMoneySchema } from "./money.schemas.js";

export const expenseCategorySchema = z.enum(["RENT", "UTILITIES", "SALARY", "MARKETING", "MAINTENANCE", "OTHER"]);

export const createExpenseSchema = z.object({
  outletId: z.string().min(1).optional(),
  category: expenseCategorySchema,
  description: z.string().max(500).optional(),
  amount: largeMoneySchema,
  incurredAt: z.coerce.date(),
});
export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;
