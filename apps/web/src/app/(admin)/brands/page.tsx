import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateBrandForm } from "./create-brand-form";

interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
}

export default async function BrandsPage() {
  const res = await apiFetch("/v1/brands");
  const brands: Brand[] = res.ok ? ((await res.json()) as Brand[]) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Brands</h1>
      <p className="mt-2 text-sm text-slate-600">
        Restaurant concepts within this organization (e.g. Cafe Old Monk, Pizza Paproni, Bounty Bakery). Each
        brand owns its outlets and is produced by one or more kitchens — see the Kitchens page to map them.
      </p>

      <div className="mt-4">
        <CreateBrandForm />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Slug</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">{brand.name}</td>
              <td className="px-4 py-2 text-slate-500">{brand.slug}</td>
              <td className="px-4 py-2">{brand.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`brands/${brand.id}`} isActive={brand.isActive} />
              </td>
            </tr>
          ))}
          {brands.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                No brands yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
