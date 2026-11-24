"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, ChipGroup } from "@kitchenos/ui";

const CHANNELS = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "TAKEAWAY", label: "Parcel" },
  { value: "DELIVERY", label: "Delivery" },
];

export function NewOrderForm({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const singleOutletId = outlets.length === 1 ? outlets[0]!.id : null;
  const [outletId, setOutletId] = useState(singleOutletId ?? "");
  const [channel, setChannel] = useState("DINE_IN");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function startOrder() {
    if (!outletId) {
      setError("Pehle outlet pe tap karo.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId, channel }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Order shuru nahi ho paaya." }))) as {
          message?: string;
        };
        setError(body.message ?? "Order shuru nahi ho paaya. Dobara koshish karo.");
        return;
      }
      const order = await res.json();
      router.push(`/pos/orders/${order.id}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Chips instead of dropdowns: the choice is visible without opening anything,
          and each one is a full-size tap target. */}
      {!singleOutletId ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">Outlet</p>
          <ChipGroup label="Outlet">
            {outlets.map((o) => (
              <Chip key={o.id} selected={outletId === o.id} onSelect={() => setOutletId(o.id)}>
                {o.name}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">Order kis type ka hai</p>
        <ChipGroup label="Order type">
          {CHANNELS.map((c) => (
            <Chip key={c.value} selected={channel === c.value} onSelect={() => setChannel(c.value)}>
              {c.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <Button type="button" size="lg" onClick={startOrder} isLoading={isLoading} className="self-start">
        Order shuru karo
      </Button>

      {error ? (
        <p className="rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
