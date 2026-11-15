import { z } from "zod";
import { largeMoneySchema } from "./money.schemas.js";

export const orderChannelSchema = z.enum(["DINE_IN", "DELIVERY", "TAKEAWAY"]);
export const paymentMethodSchema = z.enum(["CASH", "CARD", "UPI", "WALLET"]);

export const createOrderSchema = z.object({
  outletId: z.string().min(1),
  channel: orderChannelSchema,
  customerId: z.string().min(1).optional(),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const addOrderItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
});
export type AddOrderItemDto = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
});
export type UpdateOrderItemDto = z.infer<typeof updateOrderItemSchema>;

export const addPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: largeMoneySchema,
  referenceNumber: z.string().max(80).optional(),
});
export type AddPaymentDto = z.infer<typeof addPaymentSchema>;

/**
 * Replays an order a cashier took while offline (POS "Offline sale" screen), once the device is
 * back online. `clientOrderId` (generated on-device) is what makes this safe to retry: the same
 * id submitted twice must create the order at most once, never twice. Deliberately narrower than
 * the full order-taking API — no combos, promotions, loyalty redemption or customer linking —
 * since those all need live server state (combo/promo validity, a loyalty balance) that can't be
 * trusted from a device that's been offline; a cashier needing any of those finishes the sale
 * online instead. Cash only, for the same reason a card/UPI payment can't be processed offline.
 */
export const syncOfflineOrderSchema = z.object({
  clientOrderId: z.string().uuid(),
  outletId: z.string().min(1),
  channel: orderChannelSchema,
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(100),
  cashTendered: largeMoneySchema,
});
export type SyncOfflineOrderDto = z.infer<typeof syncOfflineOrderSchema>;
