import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ActionButton } from "./action-button";
import { ReceiveItemForm } from "./receive-item-form";

interface PurchaseOrderItem {
  id: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitCost: string;
  ingredient: { name: string; unit: string };
}

interface PurchaseOrderDetail {
  id: string;
  orderNumber: number;
  status: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  supplier: { name: string };
  kitchen: { name: string };
  items: PurchaseOrderItem[];
  createdAt: string;
}

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/v1/purchase-orders/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load purchase order");
  const po: PurchaseOrderDetail = await res.json();

  const canReceive = po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED";
  const canCancel = po.status !== "RECEIVED" && po.status !== "CANCELLED";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Purchase Order #{po.orderNumber}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {po.supplier.name} → {po.kitchen.name} · {po.status}
          </p>
        </div>
        <div className="flex gap-2">
          {po.status === "DRAFT" ? <ActionButton path={`purchase-orders/${po.id}/submit`} label="Submit" variant="primary" /> : null}
          {canCancel ? <ActionButton path={`purchase-orders/${po.id}/cancel`} label="Cancel" variant="danger" /> : null}
        </div>
      </div>

      <table className="mt-6 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Ingredient</th>
            <th className="px-4 py-2">Unit cost</th>
            <th className="px-4 py-2">Ordered</th>
            <th className="px-4 py-2">Received</th>
            {canReceive ? <th className="px-4 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {po.items.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">{item.ingredient.name}</td>
              <td className="px-4 py-2 text-ink-2">₹{item.unitCost}</td>
              <td className="px-4 py-2 text-ink-2">
                {item.quantityOrdered} {item.ingredient.unit}
              </td>
              <td className="px-4 py-2 text-ink">
                {item.quantityReceived} {item.ingredient.unit}
              </td>
              {canReceive ? (
                <td className="px-4 py-2">
                  {Number(item.quantityReceived) < Number(item.quantityOrdered) ? (
                    <ReceiveItemForm purchaseOrderId={po.id} itemId={item.id} />
                  ) : (
                    <span className="text-xs text-ink-3">fully received</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
