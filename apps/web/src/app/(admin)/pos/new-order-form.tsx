"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@kitchenos/ui";

const CHANNEL_OPTIONS = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "TAKEAWAY", label: "Takeaway" },
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
      setError("Outlet chuno.");
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
        setError(body.message ?? "Order shuru nahi ho paaya.");
        return;
      }
      const order = await res.json();
      router.push(`/pos/orders/${order.id}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {!singleOutletId ? (
        <Select
          aria-label="Outlet"
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
          options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          placeholder="Outlet chuno"
        />
      ) : null}
      <Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} options={CHANNEL_OPTIONS} />
      <button
        type="button"
        onClick={startOrder}
        disabled={isLoading}
        className="rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {isLoading ? "…" : "+ Naya Order"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
