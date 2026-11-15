import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { UnmapButton } from "@/components/unmap-button";
import { AddStationForm } from "./add-station-form";
import { MapBrandForm } from "./map-brand-form";

interface KitchenDetail {
  id: string;
  name: string;
  code: string;
  kind: "PRODUCTION" | "CENTRAL_WAREHOUSE";
  isActive: boolean;
  stations: { id: string; name: string; code: string; isActive: boolean }[];
  brandKitchens: { id: string; isPrimary: boolean; brand: { id: string; name: string } }[];
}

interface Brand {
  id: string;
  name: string;
}

export default async function KitchenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [kitchenRes, brandsRes] = await Promise.all([
    apiFetch(`/v1/kitchens/${id}`),
    apiFetch("/v1/brands"),
  ]);

  if (kitchenRes.status === 404) notFound();
  if (!kitchenRes.ok) throw new Error("Failed to load kitchen");

  const kitchen: KitchenDetail = await kitchenRes.json();
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const mappedBrandIds = new Set(kitchen.brandKitchens.map((bk) => bk.brand.id));
  const availableBrands = brands.filter((b) => !mappedBrandIds.has(b.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{kitchen.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {kitchen.code} · {kitchen.kind === "CENTRAL_WAREHOUSE" ? "Central warehouse" : "Production kitchen"}
          </p>
        </div>
        <ToggleActiveButton path={`kitchens/${kitchen.id}`} isActive={kitchen.isActive} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Stations</h2>
        <p className="mt-1 text-sm text-slate-500">Functional stations used later by the kitchen display system.</p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <AddStationForm kitchenId={kitchen.id} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {kitchen.stations.map((station) => (
              <tr key={station.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{station.name}</td>
                <td className="px-4 py-2 text-slate-500">{station.code}</td>
                <td className="px-4 py-2">{station.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {kitchen.stations.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No stations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Brands served</h2>
        <p className="mt-1 text-sm text-slate-500">
          A kitchen can produce for several brands at once (shared kitchen) or just one (dedicated kitchen).
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <MapBrandForm kitchenId={kitchen.id} availableBrands={availableBrands} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Primary</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {kitchen.brandKitchens.map((mapping) => (
              <tr key={mapping.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{mapping.brand.name}</td>
                <td className="px-4 py-2 text-slate-500">{mapping.isPrimary ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`kitchens/${kitchen.id}/brands/${mapping.brand.id}`} />
                </td>
              </tr>
            ))}
            {kitchen.brandKitchens.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No brands mapped yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
