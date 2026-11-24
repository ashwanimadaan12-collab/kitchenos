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
      <h1 className="text-2xl font-semibold text-ink">Suppliers</h1>
      <p className="mt-2 text-sm text-ink-2">Vendors you buy ingredients and packaging from.</p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateSupplierForm />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
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
            <tr key={supplier.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">{supplier.name}</td>
              <td className="px-4 py-2 text-ink-2">{supplier.contactName ?? "—"}</td>
              <td className="px-4 py-2 text-ink-2">{supplier.phone ?? "—"}</td>
              <td className="px-4 py-2 text-ink-2">{supplier.leadTimeDays}d</td>
              <td className="px-4 py-2">{supplier.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`suppliers/${supplier.id}`} isActive={supplier.isActive} />
              </td>
            </tr>
          ))}
          {suppliers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                No suppliers yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
