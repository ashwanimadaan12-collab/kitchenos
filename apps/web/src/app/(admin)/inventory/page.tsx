import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Kitchen {
  id: string;
  name: string;
  code: string;
  kind: "PRODUCTION" | "CENTRAL_WAREHOUSE";
}

export default async function InventoryLandingPage() {
  const res = await apiFetch("/v1/kitchens");
  const kitchens: Kitchen[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Inventory</h1>
      <p className="mt-2 text-sm text-slate-600">Pick a kitchen to see its stock on hand and movement ledger.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kitchens.map((kitchen) => (
          <Link
            key={kitchen.id}
            href={`/inventory/${kitchen.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <p className="text-sm text-slate-500">{kitchen.kind === "CENTRAL_WAREHOUSE" ? "Central warehouse" : "Production"}</p>
            <p className="mt-1 font-medium text-slate-900">{kitchen.name}</p>
            <p className="text-xs text-slate-400">{kitchen.code}</p>
          </Link>
        ))}
        {kitchens.length === 0 ? <p className="text-sm text-slate-400">No kitchens yet.</p> : null}
      </div>
    </div>
  );
}
