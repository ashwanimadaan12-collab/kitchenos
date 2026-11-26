import { z } from "zod";

/**
 * How far an order has physically travelled, separate from whether it is paid.
 * One ladder for every channel, forward-only. PICKED_UP exists only for delivery:
 * dine-in and takeaway go READY -> COMPLETED.
 */
export const FULFILLMENT_STAGES = ["PLACED", "COOKING", "READY", "PICKED_UP", "COMPLETED"] as const;
export type FulfillmentStage = (typeof FULFILLMENT_STAGES)[number];

export const fulfillmentStageSchema = z.enum(FULFILLMENT_STAGES);

export const advanceFulfillmentSchema = z.object({
  stage: fulfillmentStageSchema,
  /** Required when moving a DELIVERY order to PICKED_UP; rejected on any other channel. */
  riderId: z.string().min(1).nullish(),
});
export type AdvanceFulfillmentDto = z.infer<typeof advanceFulfillmentSchema>;

export type OrderChannel = "DINE_IN" | "DELIVERY" | "TAKEAWAY";

const RANK: Record<FulfillmentStage, number> = {
  PLACED: 0,
  COOKING: 1,
  READY: 2,
  PICKED_UP: 3,
  COMPLETED: 4,
};

export function stageRank(stage: FulfillmentStage): number {
  return RANK[stage];
}

/** True when `to` is strictly ahead of `from`. The ladder never runs backwards. */
export function isForwardStage(from: FulfillmentStage, to: FulfillmentStage): boolean {
  return RANK[to] > RANK[from];
}

/** Only a delivery order has a rider leg. */
export function stageAppliesTo(stage: FulfillmentStage, channel: OrderChannel): boolean {
  return stage !== "PICKED_UP" || channel === "DELIVERY";
}

/** The stages an order of this channel actually passes through, in order. */
export function stagesFor(channel: OrderChannel): FulfillmentStage[] {
  return FULFILLMENT_STAGES.filter((s) => stageAppliesTo(s, channel));
}

/** The next stage an order of this channel should move to, or null if it is finished. */
export function nextStage(current: FulfillmentStage, channel: OrderChannel): FulfillmentStage | null {
  const ladder = stagesFor(channel);
  const i = ladder.indexOf(current);
  // A delivery order that was downgraded to takeaway could sit on a stage not in the
  // ladder; treat the first stage ahead of it as next rather than returning null.
  if (i === -1) return ladder.find((s) => RANK[s] > RANK[current]) ?? null;
  return ladder[i + 1] ?? null;
}

/**
 * What the cashier sees. The same stage reads differently per channel — a READY delivery
 * is waiting for a rider, a READY dine-in is waiting for a waiter — so every label is
 * written for the person tapping it, in the Hinglish the rest of the POS uses.
 */
const LABELS: Record<OrderChannel, Record<FulfillmentStage, string>> = {
  DINE_IN: {
    PLACED: "Order liya",
    COOKING: "Ban raha hai",
    READY: "Ready hai",
    PICKED_UP: "Uthaya",
    COMPLETED: "Table par laga diya",
  },
  TAKEAWAY: {
    PLACED: "Order liya",
    COOKING: "Ban raha hai",
    READY: "Ready hai — packing",
    PICKED_UP: "Uthaya",
    COMPLETED: "Customer ko de diya",
  },
  DELIVERY: {
    PLACED: "Order liya",
    COOKING: "Ban raha hai",
    READY: "Ready hai — rider ka wait",
    PICKED_UP: "Rider nikal gaya",
    COMPLETED: "Deliver ho gaya",
  },
};

export function fulfillmentLabel(stage: FulfillmentStage, channel: OrderChannel): string {
  return LABELS[channel][stage];
}

/** The text on the button that moves an order *into* this stage. */
const ACTIONS: Record<OrderChannel, Record<FulfillmentStage, string>> = {
  DINE_IN: {
    PLACED: "Order liya",
    COOKING: "Banana shuru",
    READY: "Ready",
    PICKED_UP: "Uthaya",
    COMPLETED: "Table par laga diya",
  },
  TAKEAWAY: {
    PLACED: "Order liya",
    COOKING: "Banana shuru",
    READY: "Ready",
    PICKED_UP: "Uthaya",
    COMPLETED: "De diya",
  },
  DELIVERY: {
    PLACED: "Order liya",
    COOKING: "Banana shuru",
    READY: "Ready",
    PICKED_UP: "Rider ko diya",
    COMPLETED: "Deliver ho gaya",
  },
};

export function fulfillmentAction(stage: FulfillmentStage, channel: OrderChannel): string {
  return ACTIONS[channel][stage];
}

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  DINE_IN: "Table",
  TAKEAWAY: "Parcel",
  DELIVERY: "Delivery",
};

export const riderInputSchema = z.object({
  outletId: z.string().min(1),
  name: z.string().min(1).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, "Phone 10 ank ka hona chahiye")
    .nullish(),
  isActive: z.boolean().optional(),
});
export type RiderInputDto = z.infer<typeof riderInputSchema>;

export const updateRiderSchema = riderInputSchema.partial().omit({ outletId: true });
export type UpdateRiderDto = z.infer<typeof updateRiderSchema>;
