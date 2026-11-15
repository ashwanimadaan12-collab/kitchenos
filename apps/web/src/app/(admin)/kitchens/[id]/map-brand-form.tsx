"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface MapBrandFormProps {
  kitchenId: string;
  availableBrands: { id: string; name: string }[];
}

export function MapBrandForm({ kitchenId, availableBrands }: MapBrandFormProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/kitchens/${kitchenId}/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not map brand." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not map brand.");
        return;
      }
      setBrandId("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableBrands.length === 0) {
    return <p className="text-sm text-slate-400">Every brand in this organization is already mapped.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Brand to map"
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
        options={availableBrands.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="Select a brand"
      />
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!brandId}>
        Map brand
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
