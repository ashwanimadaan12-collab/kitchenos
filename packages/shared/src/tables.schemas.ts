import { z } from "zod";

export const createTableSchema = z.object({
  outletId: z.string().min(1),
  name: z.string().min(1).max(40),
});
export type CreateTableDto = z.infer<typeof createTableSchema>;

export const updateTableSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateTableDto = z.infer<typeof updateTableSchema>;

/**
 * What a customer submits after scanning a table's QR code. No price is accepted from the
 * client — same stance as everywhere else money is calculated in this codebase (see
 * syncOfflineOrderSchema): the server resolves every item's real price from live pricing rules
 * when the order is actually placed.
 */
export const placeTableOrderSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(100),
});
export type PlaceTableOrderDto = z.infer<typeof placeTableOrderSchema>;
