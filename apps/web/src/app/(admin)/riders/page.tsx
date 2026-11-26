import { Card, CardHeader } from "@kitchenos/ui";
import { apiFetch } from "@/lib/api";
import { RidersManager, type Rider, type RiderOutlet } from "./riders-manager";

export const dynamic = "force-dynamic";

export default async function RidersPage() {
  const [ridersRes, outletsRes] = await Promise.all([
    apiFetch("/v1/riders?includeInactive=true"),
    apiFetch("/v1/outlets"),
  ]);
  const riders: Rider[] = ridersRes.ok ? await ridersRes.json() : [];
  const outlets: RiderOutlet[] = outletsRes.ok ? await outletsRes.json() : [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Delivery boys</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Jo naam yahan add karoge, wahi Status board par dikhega jab delivery order rider ko doge. Inke liye koi login
          nahi banta — sirf naam aur number.
        </p>
      </header>

      <Card>
        <CardHeader title="Naam" />
        <p className="mt-1 text-sm text-ink-2">
          Chhodne wale ko hatao nahi — band karo. Purane order ka record bana rahega.
        </p>
        <div className="mt-4">
          <RidersManager riders={riders} outlets={outlets} />
        </div>
      </Card>
    </div>
  );
}
