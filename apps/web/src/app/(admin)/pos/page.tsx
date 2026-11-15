import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { NewOrderForm } from "./new-order-form";

interface Outlet {
  id: string;
  name: string;
  code: string;
}

interface Order {
  id: string;
  orderNumber: number;
  channel: string;
  status: string;
  total: string;
  outlet: { name: string };
  createdAt: string;
}

export default async function PosPage() {
  const [outletsRes, openOrdersRes] = await Promise.all([
    apiFetch("/v1/outlets"),
    apiFetch("/v1/orders?status=OPEN"),
  ]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const openOrders: Order[] = openOrdersRes.ok ? await openOrdersRes.json() : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Point of Sale</h1>
        <Link href="/pos/offline" className="text-sm font-medium text-slate-600 hover:underline">
          Offline sale →
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Open a new bill at an outlet, or resume one that&apos;s still open. If the connection drops, use{" "}
        <Link href="/pos/offline" className="underline">
          Offline sale
        </Link>{" "}
        for a cash-only sale that syncs automatically once you&apos;re back online.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <NewOrderForm outlets={outlets} />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Open orders</h2>
      <table className="mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Order #</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Total</th>
            <th className="px-4 py-2">Opened</th>
          </tr>
        </thead>
        <tbody>
          {openOrders.map((order) => (
            <tr key={order.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/pos/orders/${order.id}`} className="hover:underline">
                  #{order.orderNumber}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-500">{order.outlet.name}</td>
              <td className="px-4 py-2 text-slate-500">{order.channel}</td>
              <td className="px-4 py-2 text-slate-900">₹{order.total}</td>
              <td className="px-4 py-2 text-slate-500">{new Date(order.createdAt).toLocaleTimeString()}</td>
            </tr>
          ))}
          {openOrders.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                No open orders.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
