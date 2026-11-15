"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function AddComboItemForm({ comboId, variants }: { comboId: string; variants: { id: string; label: string }[] }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId || !quantity) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/combos/${comboId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: Number(quantity) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add item." }))) as { message?: string };
        setError(body.message ?? "Could not add item.");
        return;
      }
      setVariantId("");
      setQuantity("1");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (variants.length === 0) {
    return <p className="text-sm text-slate-400">Every variant from this brand is already a component.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Variant"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={variants.map((v) => ({ value: v.id, label: v.label }))}
        placeholder="Select a variant to add"
      />
      <div>
        <label className="block text-xs font-medium text-slate-600">Quantity</label>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 w-20 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" variant="secondary" isLoading={isLoading}>
        Add item
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
