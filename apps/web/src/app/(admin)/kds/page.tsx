import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { FixKitchenRoutingButton } from "./fix-kitchen-routing-button";

interface Kitchen {
  id: string;
  name: string;
  stations: { id: string; name: string; isActive: boolean }[];
}

export default async function KdsLandingPage() {
  const res = await apiFetch("/v1/kitchens");
  const kitchens: Kitchen[] = res.ok ? await res.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Kitchen Display</h1>
      <p className="mt-2 text-sm text-ink-2">Pick a station to see its ticket queue.</p>

      <FixKitchenRoutingButton />

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kitchens.flatMap((kitchen) =>
          kitchen.stations
            .filter((s) => s.isActive)
            .map((station) => (
              <Link
                key={station.id}
                href={`/kds/${station.id}`}
                className="rounded-lg border border-line bg-surface p-4 hover:border-brand"
              >
                <p className="text-sm text-ink-2">{kitchen.name}</p>
                <p className="mt-1 font-medium text-ink">{station.name}</p>
              </Link>
            )),
        )}
        {kitchens.every((k) => k.stations.length === 0) ? (
          <p className="text-sm text-ink-3">No kitchen stations yet.</p>
        ) : null}
      </div>
    </div>
  );
}
