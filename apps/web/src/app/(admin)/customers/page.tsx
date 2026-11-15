import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateCustomerForm } from "./create-customer-form";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  loyaltyPoints: number;
}

export default async function CustomersPage() {
  const res = await apiFetch("/v1/customers");
  const customers: Customer[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
      <p className="mt-2 text-sm text-slate-600">
        One loyalty point is earned per ₹100 of a paid order&apos;s total. There&apos;s no redemption flow — points
        are tracked, not yet spendable.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreateCustomerForm />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Phone</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Loyalty points</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/customers/${customer.id}`} className="hover:underline">
                  {customer.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-500">{customer.phone}</td>
              <td className="px-4 py-2 text-slate-500">{customer.email ?? "—"}</td>
              <td className="px-4 py-2 text-slate-900">{customer.loyaltyPoints}</td>
            </tr>
          ))}
          {customers.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                No customers yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
