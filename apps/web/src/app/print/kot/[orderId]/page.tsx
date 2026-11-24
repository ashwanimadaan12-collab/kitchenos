import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AutoPrint } from "../../auto-print";
import { PrintButton } from "../../print-button";
import { ThermalSheet, ThermalStyles, paperFromSearch } from "../../thermal";

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  status: "ACTIVE" | "VOIDED";
  comboName: string | null;
}

interface OrderDetail {
  orderNumber: number;
  channel: string;
  createdAt: string;
  outlet: { name: string };
  table: { name: string } | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  DINE_IN: "DINE-IN",
  TAKEAWAY: "PARCEL",
  DELIVERY: "DELIVERY",
};

/**
 * A Kitchen Order Ticket — what the kitchen prints and works from, so deliberately
 * no prices: the kitchen needs what to make and how many, not what it costs.
 *
 * Read across a hot counter at arm's length, so quantity and item name are the
 * largest things on the paper and the table number sits at the top where a cook
 * glances first.
 */
export default async function KotPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paper?: string; items?: string; round?: string }>;
}) {
  const [{ orderId }, { paper: paperParam, items: itemsParam, round }] = await Promise.all([
    params,
    searchParams,
  ]);
  const paper = paperFromSearch(paperParam);

  const res = await apiFetch(`/v1/orders/${orderId}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load order");
  const order: OrderDetail & { items: OrderItem[] } = await res.json();

  // `items` narrows the ticket to the lines named in it. A customer who orders
  // again mid-meal must not send the kitchen a fresh ticket for the food it
  // already cooked, so the counter prints only what is new.
  const wanted = itemsParam ? new Set(itemsParam.split(",").filter(Boolean)) : null;
  const activeItems = order.items.filter(
    (i) => i.status === "ACTIVE" && (wanted === null || wanted.has(i.id)),
  );
  const totalPieces = activeItems.reduce((sum, i) => sum + i.quantity, 0);
  const isPartial = wanted !== null;

  const placedAt = new Date(order.createdAt);

  return (
    <>
      <ThermalStyles paper={paper} />
      <ThermalSheet>
        <AutoPrint />
        <PrintButton paper={paper} />

        <div className="t-center">
          <p className="t-huge" style={{ margin: 0 }}>
            {order.table ? order.table.name : CHANNEL_LABEL[order.channel] ?? order.channel}
          </p>
          <p className="t-big t-bold" style={{ margin: "0.5mm 0 0" }}>
            KOT{round ? ` ${round}` : ""} · #{order.orderNumber}
          </p>
          {isPartial ? (
            <p className="t-bold" style={{ margin: "0.5mm 0 0" }}>
              *** NAYE ITEM ONLY ***
            </p>
          ) : null}
          <p style={{ margin: "0.5mm 0 0" }}>{order.outlet.name}</p>
          <p style={{ margin: 0 }}>
            {CHANNEL_LABEL[order.channel] ?? order.channel} ·{" "}
            {placedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {placedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit" })}
          </p>
        </div>

        <div className="t-rule-solid" />

        {/* One table, quantity first: a cook scans the left edge for counts. */}
        <table>
          <tbody>
            {activeItems.map((item) => (
              <tr key={item.id}>
                <td className="t-huge" style={{ width: "11mm", paddingBottom: "2mm" }}>
                  {item.quantity}
                </td>
                <td className="t-big t-bold t-wrap" style={{ paddingBottom: "2mm" }}>
                  {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ""}
                  {item.comboName ? (
                    <>
                      <br />
                      <span style={{ fontSize: "10px", fontWeight: 400 }}>Combo: {item.comboName}</span>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {activeItems.length === 0 ? (
              <tr>
                <td colSpan={2} className="t-center">
                  Koi item nahi / No items
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="t-rule" />
        <div className="t-row t-bold">
          <span>Total pieces</span>
          <span>{totalPieces}</span>
        </div>
      </ThermalSheet>
    </>
  );
}
