import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateOutletForm } from "./create-outlet-form";

interface Outlet {
  id: string;
  name: string;
  code: string;
  city: string | null;
  isActive: boolean;
  brand: { name: string };
  outletKitchens: { kitchen: { name: string } }[];
}

interface Brand {
  id: string;
  name: string;
}

export default async function OutletsPage() {
  const [outletsRes, brandsRes] = await Promise.all([apiFetch("/v1/outlets"), apiFetch("/v1/brands")]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Outlets</h1>
      <p className="mt-2 text-sm text-ink-2">
        Points of sale, each belonging to exactly one brand. Open an outlet to assign the kitchen(s) that
        fulfil it.
      </p>

      <div className="mt-4">
        <CreateOutletForm brands={brands} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">City</th>
            <th className="px-4 py-2">Kitchens</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet) => (
            <tr key={outlet.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">
                <Link href={`/outlets/${outlet.id}`} className="hover:underline">
                  {outlet.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-ink-2">{outlet.code}</td>
              <td className="px-4 py-2 text-ink-2">{outlet.brand.name}</td>
              <td className="px-4 py-2 text-ink-2">{outlet.city ?? "—"}</td>
              <td className="px-4 py-2 text-ink-2">
                {outlet.outletKitchens.map((ok) => ok.kitchen.name).join(", ") || "—"}
              </td>
              <td className="px-4 py-2">{outlet.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {outlets.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                No outlets yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
