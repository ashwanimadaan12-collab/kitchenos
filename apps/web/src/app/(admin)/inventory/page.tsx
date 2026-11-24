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
      <h1 className="text-2xl font-semibold text-ink">Inventory</h1>
      <p className="mt-2 text-sm text-ink-2">Pick a kitchen to see its stock on hand and movement ledger.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kitchens.map((kitchen) => (
          <Link
            key={kitchen.id}
            href={`/inventory/${kitchen.id}`}
            className="rounded-lg border border-line bg-surface p-4 hover:border-brand"
          >
            <p className="text-sm text-ink-2">{kitchen.kind === "CENTRAL_WAREHOUSE" ? "Central warehouse" : "Production"}</p>
            <p className="mt-1 font-medium text-ink">{kitchen.name}</p>
            <p className="text-xs text-ink-3">{kitchen.code}</p>
          </Link>
        ))}
        {kitchens.length === 0 ? <p className="text-sm text-ink-3">No kitchens yet.</p> : null}
      </div>
    </div>
  );
}
