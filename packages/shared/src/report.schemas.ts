import { z } from "zod";

/**
 * Shared filters across every report: an optional date window (half-open:
 * from <= closedAt < to), and optional outlet/brand/channel narrowing.
 * Every field arrives as a query string, so dates are plain ISO strings
 * coerced to Date, never parsed ad hoc per endpoint.
 */
export const reportFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  outletId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
  channel: z.enum(["DINE_IN", "DELIVERY", "TAKEAWAY"]).optional(),
});
export type ReportFilterDto = z.infer<typeof reportFilterSchema>;

export const topProductsFilterSchema = reportFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type TopProductsFilterDto = z.infer<typeof topProductsFilterSchema>;

/** Same shared filters, plus an optional kitchen drill-down for the forecast-derived
 *  dashboard metrics (stockout risk / purchase recommendations), which are kitchen-scoped. */
export const growthDashboardFilterSchema = reportFilterSchema.extend({
  kitchenId: z.string().min(1).optional(),
});
export type GrowthDashboardFilterDto = z.infer<typeof growthDashboardFilterSchema>;
