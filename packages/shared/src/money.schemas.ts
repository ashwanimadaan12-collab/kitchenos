import { z } from "zod";

/**
 * Canonical decimal-string regexes/schemas for every money/quantity/cost field across the
 * API, single-sourced here instead of being redeclared (with silently drifting digit
 * limits) in each feature's own schema file. Every limit below is sized to match the
 * integer-digit capacity of the Prisma `Decimal` column it validates — e.g. `Decimal(10, 2)`
 * stores 10 total digits with 2 after the decimal point, so its string form allows at most
 * 8 digits before the point. Widening one of these without checking schema.prisma risks a
 * value that passes validation but then overflows on insert ("numeric field overflow").
 *
 * - MONEY_RE        — Decimal(10, 2): unit/catalog prices (basePrice, comboPrice, promotion.value, ...)
 * - LARGE_MONEY_RE  — Decimal(12, 2): order/aggregate totals and payment/expense amounts
 * - QUANTITY_RE     — Decimal(10, 3): recipe and purchase-order-line quantities
 * - LARGE_QUANTITY_RE — Decimal(12, 3): stock balance/movement quantities
 * - COST_RE         — Decimal(10, 4): per-unit ingredient costs
 */
export const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;
export const LARGE_MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
export const QUANTITY_RE = /^\d{1,7}(\.\d{1,3})?$/;
export const LARGE_QUANTITY_RE = /^\d{1,9}(\.\d{1,3})?$/;
export const SIGNED_LARGE_QUANTITY_RE = /^-?\d{1,9}(\.\d{1,3})?$/;
export const COST_RE = /^\d{1,6}(\.\d{1,4})?$/;

export const moneySchema = z.string().regex(MONEY_RE, "must be a non-negative amount with up to 2 decimal places");
export const largeMoneySchema = z
  .string()
  .regex(LARGE_MONEY_RE, "must be a non-negative amount with up to 2 decimal places");
export const quantitySchema = z
  .string()
  .regex(QUANTITY_RE, "must be a non-negative quantity with up to 3 decimal places");
export const largeQuantitySchema = z
  .string()
  .regex(LARGE_QUANTITY_RE, "must be a non-negative quantity with up to 3 decimal places");
export const signedLargeQuantitySchema = z
  .string()
  .regex(SIGNED_LARGE_QUANTITY_RE, "must be a quantity with up to 3 decimal places");
export const costSchema = z.string().regex(COST_RE, "must be a non-negative cost with up to 4 decimal places");
