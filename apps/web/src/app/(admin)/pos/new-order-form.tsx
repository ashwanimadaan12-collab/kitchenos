"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const CHANNEL_OPTIONS = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "TAKEAWAY", label: "Takeaway" },
];

export function NewOrderForm({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");
  const [channel, setChannel] = useState("DINE_IN");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outletId) {
      setError("Choose an outlet.");
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
        const body = (await res.json().catch(() => ({ message: "Could not open order." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not open order.");
        return;
      }
      const order = await res.json();
      router.push(`/pos/orders/${order.id}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Outlet"
        value={outletId}
        onChange={(e) => setOutletId(e.target.value)}
        options={outlets.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="Select an outlet"
      />
      <Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} options={CHANNEL_OPTIONS} />
      <Button type="submit" isLoading={isLoading}>
        New order
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
