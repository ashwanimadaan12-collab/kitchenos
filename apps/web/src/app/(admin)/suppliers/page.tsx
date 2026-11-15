import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateSupplierForm } from "./create-supplier-form";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  leadTimeDays: number;
  isActive: boolean;
}

export default async function SuppliersPage() {
  const res = await apiFetch("/v1/suppliers");
  const suppliers: Supplier[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Suppliers</h1>
      <p className="mt-2 text-sm text-slate-600">Vendors you buy ingredients and packaging from.</p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreateSupplierForm />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Contact</th>
            <th className="px-4 py-2">Phone</th>
            <th className="px-4 py-2">Lead time</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">{supplier.name}</td>
              <td className="px-4 py-2 text-slate-500">{supplier.contactName ?? "—"}</td>
              <td className="px-4 py-2 text-slate-500">{supplier.phone ?? "—"}</td>
              <td className="px-4 py-2 text-slate-500">{supplier.leadTimeDays}d</td>
              <td className="px-4 py-2">{supplier.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`suppliers/${supplier.id}`} isActive={supplier.isActive} />
              </td>
            </tr>
          ))}
          {suppliers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                No suppliers yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
