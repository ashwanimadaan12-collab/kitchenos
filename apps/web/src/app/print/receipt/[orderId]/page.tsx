import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AutoPrint } from "../../auto-print";
import { PrintButton } from "../../print-button";

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  status: "ACTIVE" | "VOIDED";
}

interface Payment {
  id: string;
  method: string;
  amount: string;
}

interface OrderDetail {
  orderNumber: number;
  channel: string;
  status: string;
  subtotal: string;
  taxTotal: string;
  discountAmount: string;
  loyaltyDiscountAmount: string;
  total: string;
  createdAt: string;
  outlet: { name: string };
  items: OrderItem[];
  payments: Payment[];
  customer: { name: string } | null;
  promotion: { code: string } | null;
}

/**
 * Deliberately not under the (admin) route group — no sidebar/header, just the bill — so printing
 * it doesn't also print the whole app chrome. The auth middleware still protects this path like
 * any other (its matcher only exempts the PWA/offline plumbing), so this is never reachable
 * without a session.
 */
export default async function ReceiptPrintPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const res = await apiFetch(`/v1/orders/${orderId}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load order");
  const order: OrderDetail = await res.json();
  const activeItems = order.items.filter((i) => i.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-xs bg-white p-4 font-mono text-xs text-black print:max-w-none print:p-0">
      <AutoPrint />
      <PrintButton />

      <div className="text-center">
        <p className="text-sm font-bold">{order.outlet.name}</p>
        <p>Order #{order.orderNumber}</p>
        <p>
          {order.channel} · {new Date(order.createdAt).toLocaleString()}
        </p>
        {order.customer ? <p>Customer: {order.customer.name}</p> : null}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full">
        <tbody>
          {activeItems.map((item) => (
            <tr key={item.id}>
              <td colSpan={3}>
                {item.productName} — {item.variantName}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full">
        <tbody>
          {activeItems.map((item) => (
            <tr key={`${item.id}-amounts`}>
              <td className="w-10">{item.quantity}x</td>
              <td className="text-right">₹{item.unitPrice}</td>
              <td className="w-16 text-right">₹{item.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>₹{order.subtotal}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>₹{order.taxTotal}</span>
      </div>
      {Number(order.discountAmount) > 0 ? (
        <div className="flex justify-between">
          <span>Discount{order.promotion ? ` (${order.promotion.code})` : ""}</span>
          <span>-₹{order.discountAmount}</span>
        </div>
      ) : null}
      {Number(order.loyaltyDiscountAmount) > 0 ? (
        <div className="flex justify-between">
          <span>Loyalty redeemed</span>
          <span>-₹{order.loyaltyDiscountAmount}</span>
        </div>
      ) : null}
      <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold">
        <span>Total</span>
        <span>₹{order.total}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      {order.payments.map((p) => (
        <div key={p.id} className="flex justify-between">
          <span>{p.method}</span>
          <span>₹{p.amount}</span>
        </div>
      ))}

      <p className="mt-4 text-center">Thank you!</p>
    </div>
  );
}
