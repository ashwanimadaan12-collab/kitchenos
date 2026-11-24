import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { CommunicationPreferencesPanel } from "./communication-preferences-panel";
import { LoyaltyWalletPanel } from "./loyalty-wallet-panel";

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  loyaltyPoints: number;
}

interface OrderHistoryRow {
  id: string;
  orderNumber: number;
  status: string;
  total: string;
  createdAt: string;
  outlet: { name: string };
}

interface CommunicationPreference {
  channel: "WHATSAPP" | "SMS";
  transactionalOptIn: boolean;
  marketingOptIn: boolean;
  consentSource: string | null;
  consentGivenAt: string | null;
  optedOutAt: string | null;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customerRes, ordersRes, preferencesRes, walletRes, transactionsRes] = await Promise.all([
    apiFetch(`/v1/customers/${id}`),
    apiFetch(`/v1/customers/${id}/orders`),
    apiFetch(`/v1/customers/${id}/communication-preferences`),
    apiFetch(`/v1/customers/${id}/loyalty/wallet`),
    apiFetch(`/v1/customers/${id}/loyalty/transactions`),
  ]);
  if (customerRes.status === 404) notFound();
  if (!customerRes.ok) throw new Error("Failed to load customer");
  const customer: CustomerDetail = await customerRes.json();
  const orders: OrderHistoryRow[] = ordersRes.ok ? await ordersRes.json() : [];
  const preferences: CommunicationPreference[] = preferencesRes.ok ? await preferencesRes.json() : [];
  const wallet = walletRes.ok
    ? await walletRes.json()
    : { balance: customer.loyaltyPoints, lifetimePoints: 0, tier: null, nextTier: null };
  const transactions = transactionsRes.ok ? await transactionsRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">{customer.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {customer.phone} · {customer.email ?? "no email"} · {customer.loyaltyPoints} loyalty points
      </p>
      {customer.notes ? <p className="mt-2 text-sm text-ink-2">{customer.notes}</p> : null}

      <table className="mt-6 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Order #</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Total</th>
            <th className="px-4 py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">#{order.orderNumber}</td>
              <td className="px-4 py-2 text-ink-2">{order.outlet.name}</td>
              <td className="px-4 py-2 text-ink-2">{order.status}</td>
              <td className="px-4 py-2 text-ink">₹{order.total}</td>
              <td className="px-4 py-2 text-ink-2">{new Date(order.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {orders.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No orders yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <LoyaltyWalletPanel customerId={customer.id} wallet={wallet} transactions={transactions} />
      <CommunicationPreferencesPanel customerId={customer.id} preferences={preferences} />
    </div>
  );
}
