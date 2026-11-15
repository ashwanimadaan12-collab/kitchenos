"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface MapKitchenFormProps {
  outletId: string;
  availableKitchens: { id: string; name: string }[];
}

export function MapKitchenForm({ outletId, availableKitchens }: MapKitchenFormProps) {
  const router = useRouter();
  const [kitchenId, setKitchenId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kitchenId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/outlets/${outletId}/kitchens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not map kitchen." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not map kitchen.");
        return;
      }
      setKitchenId("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableKitchens.length === 0) {
    return <p className="text-sm text-slate-400">Every kitchen in this organization is already mapped.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Kitchen to map"
        value={kitchenId}
        onChange={(e) => setKitchenId(e.target.value)}
        options={availableKitchens.map((k) => ({ value: k.id, label: k.name }))}
        placeholder="Select a kitchen"
      />
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!kitchenId}>
        Map kitchen
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
