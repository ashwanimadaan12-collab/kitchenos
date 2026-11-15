import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreatePurchaseOrderForm } from "./create-purchase-order-form";

interface Supplier {
  id: string;
  name: string;
}

interface Kitchen {
  id: string;
  name: string;
}

interface Ingredient {
  id: string;
  name: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: number;
  status: string;
  supplier: { name: string };
  kitchen: { name: string };
  items: { id: string }[];
  createdAt: string;
}

export default async function PurchaseOrdersPage() {
  const [suppliersRes, kitchensRes, ingredientsRes, posRes] = await Promise.all([
    apiFetch("/v1/suppliers"),
    apiFetch("/v1/kitchens"),
    apiFetch("/v1/ingredients"),
    apiFetch("/v1/purchase-orders"),
  ]);
  const suppliers: Supplier[] = suppliersRes.ok ? await suppliersRes.json() : [];
  const kitchens: Kitchen[] = kitchensRes.ok ? await kitchensRes.json() : [];
  const ingredients: Ingredient[] = ingredientsRes.ok ? await ingredientsRes.json() : [];
  const purchaseOrders: PurchaseOrder[] = posRes.ok ? await posRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Purchase Orders</h1>
      <p className="mt-2 text-sm text-slate-600">
        Order ingredients from a supplier for delivery to a kitchen. Items can only be edited while a draft;
        once submitted, receiving against it is the only way quantities change.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreatePurchaseOrderForm suppliers={suppliers} kitchens={kitchens} ingredients={ingredients} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">PO #</th>
            <th className="px-4 py-2">Supplier</th>
            <th className="px-4 py-2">Kitchen</th>
            <th className="px-4 py-2">Items</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {purchaseOrders.map((po) => (
            <tr key={po.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/purchase-orders/${po.id}`} className="hover:underline">
                  #{po.orderNumber}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-500">{po.supplier.name}</td>
              <td className="px-4 py-2 text-slate-500">{po.kitchen.name}</td>
              <td className="px-4 py-2 text-slate-500">{po.items.length}</td>
              <td className="px-4 py-2">{po.status}</td>
            </tr>
          ))}
          {purchaseOrders.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                No purchase orders yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
