/**
 * Where an order came from, as far as the data can tell us today.
 *
 * The Order row has no `source` column yet, so this is derived:
 *  - no staff user on the order  -> the customer placed it themselves
 *    (QR at a table, or the public ordering link)
 *  - otherwise the channel tells us how it leaves the kitchen.
 *
 * Once an aggregator integration lands and Order gets a real `source` column,
 * only this function changes — every caller keeps working.
 */
export type OrderSource = "qr_table" | "online" | "delivery" | "parcel" | "pos";

export interface SourceShapedOrder {
  channel: string;
  createdByUserId?: string | null;
  tableId?: string | null;
}

export function resolveOrderSource(order: SourceShapedOrder): OrderSource {
  const placedByCustomer = !order.createdByUserId;
  if (placedByCustomer && order.tableId) return "qr_table";
  if (placedByCustomer) return "online";
  if (order.channel === "DELIVERY") return "delivery";
  if (order.channel === "TAKEAWAY") return "parcel";
  return "pos";
}

export const SOURCE_LABEL: Record<OrderSource, string> = {
  qr_table: "Table ka QR",
  online: "Apni website",
  delivery: "Delivery app",
  parcel: "Parcel",
  pos: "Counter",
};
