import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateKitchenForm } from "./create-kitchen-form";

interface Kitchen {
  id: string;
  name: string;
  code: string;
  kind: "PRODUCTION" | "CENTRAL_WAREHOUSE";
  isActive: boolean;
  stations: { id: string }[];
  brandKitchens: { brand: { name: string } }[];
}

export default async function KitchensPage() {
  const res = await apiFetch("/v1/kitchens");
  const kitchens: Kitchen[] = res.ok ? ((await res.json()) as Kitchen[]) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Kitchens</h1>
      <p className="mt-2 text-sm text-slate-600">
        Production facilities and the central warehouse. A kitchen can be dedicated to one brand or shared
        across several — open a kitchen to manage its stations and brand mappings.
      </p>

      <div className="mt-4">
        <CreateKitchenForm />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2">Brands</th>
            <th className="px-4 py-2">Stations</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {kitchens.map((kitchen) => (
            <tr key={kitchen.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/kitchens/${kitchen.id}`} className="hover:underline">
                  {kitchen.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-500">{kitchen.code}</td>
              <td className="px-4 py-2 text-slate-500">
                {kitchen.kind === "CENTRAL_WAREHOUSE" ? "Central warehouse" : "Production"}
              </td>
              <td className="px-4 py-2 text-slate-500">
                {kitchen.brandKitchens.map((bk) => bk.brand.name).join(", ") || "—"}
              </td>
              <td className="px-4 py-2 text-slate-500">{kitchen.stations.length}</td>
              <td className="px-4 py-2">{kitchen.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {kitchens.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                No kitchens yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
