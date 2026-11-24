import { z } from "zod";

export const aggregatorPlatformSchema = z.enum(["ZOMATO", "SWIGGY", "OTHER"]);
export type AggregatorPlatformDto = z.infer<typeof aggregatorPlatformSchema>;

const money = z.coerce.number().finite();

export const settlementRowInputSchema = z.object({
  externalOrderId: z.string().max(120).default(""),
  orderedAt: z.coerce.date().optional().nullable(),
  grossSales: money.default(0),
  restaurantDiscount: money.default(0),
  commission: money.default(0),
  platformFees: money.default(0),
  taxesWithheld: money.default(0),
  otherAdjustments: money.default(0),
  reportedNetPayout: money.optional().nullable(),
});
export type SettlementRowInputDto = z.infer<typeof settlementRowInputSchema>;

/**
 * Only the rows are accepted, never the totals: the server adds them up itself
 * with the same function the screen used, so a saved settlement can never
 * disagree with its own lines.
 */
export const createSettlementSchema = z.object({
  platform: aggregatorPlatformSchema,
  outletId: z.string().min(1).optional(),
  fileName: z.string().min(1).max(255),
  rows: z.array(settlementRowInputSchema).min(1).max(20_000),
});
export type CreateSettlementDto = z.infer<typeof createSettlementSchema>;
