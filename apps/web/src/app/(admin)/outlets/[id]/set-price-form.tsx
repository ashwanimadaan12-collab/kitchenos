"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface SetPriceFormProps {
  outletId: string;
  availableVariants: { id: string; label: string }[];
}

export function SetPriceForm({ outletId, availableVariants }: SetPriceFormProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/pricing/outlets/${outletId}/variants/${variantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not set price." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not set price.");
        return;
      }
      setVariantId("");
      setPrice("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableVariants.length === 0) {
    return <p className="text-sm text-ink-3">Every variant for this brand already has a price override.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Variant"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={availableVariants.map((v) => ({ value: v.id, label: v.label }))}
        placeholder="Select a variant"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="override-price">
          Override price
        </label>
        <input
          id="override-price"
          required
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="100.00"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!variantId}>
        Set price
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
