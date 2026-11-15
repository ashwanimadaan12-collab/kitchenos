import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AutoPrint } from "../../auto-print";
import { PrintButton } from "../../print-button";

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
  items: OrderItem[];
}

/**
 * A Kitchen Order Ticket — what the kitchen prints and works from, so deliberately no prices:
 * the kitchen needs what to make and how many, not what it costs. Same "no sidebar, just the
 * ticket" route shape as the receipt print page.
 */
export default async function KotPrintPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const res = await apiFetch(`/v1/orders/${orderId}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load order");
  const order: OrderDetail = await res.json();
  const activeItems = order.items.filter((i) => i.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-xs bg-white p-4 font-mono text-black print:max-w-none print:p-0">
      <AutoPrint />
      <PrintButton />

      <div className="text-center">
        <p className="text-lg font-bold">KOT</p>
        <p className="text-sm">{order.outlet.name}</p>
        <p className="text-sm">
          Order #{order.orderNumber} · {order.channel}
        </p>
        <p className="text-xs">{new Date(order.createdAt).toLocaleString()}</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <ul className="space-y-2">
        {activeItems.map((item) => (
          <li key={item.id} className="flex justify-between text-base font-bold">
            <span>
              {item.productName} — {item.variantName}
              {item.comboName ? ` (${item.comboName})` : ""}
            </span>
            <span>x{item.quantity}</span>
          </li>
        ))}
        {activeItems.length === 0 ? <li className="text-center text-sm">No active items.</li> : null}
      </ul>
    </div>
  );
}
