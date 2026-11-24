"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const TYPE_OPTIONS = [
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "WASTAGE", label: "Wastage" },
];

export function AdjustStockForm({ kitchenId, ingredients }: { kitchenId: string; ingredients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [ingredientId, setIngredientId] = useState("");
  const [type, setType] = useState("ADJUSTMENT");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/inventory/kitchens/${kitchenId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId, type, quantityDelta, note: note || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not record adjustment." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not record adjustment.");
        return;
      }
      setQuantityDelta("");
      setNote("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Ingredient"
        value={ingredientId}
        onChange={(e) => setIngredientId(e.target.value)}
        options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
        placeholder="Select an ingredient"
      />
      <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} options={TYPE_OPTIONS} />
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="quantity-delta">
          Quantity (+/-)
        </label>
        <input
          id="quantity-delta"
          required
          value={quantityDelta}
          onChange={(e) => setQuantityDelta(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="-1"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="adjustment-note">
          Note
        </label>
        <input
          id="adjustment-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading} disabled={!ingredientId}>
        Record
      </Button>
      {error ? <p className="w-full text-sm text-bad">{error}</p> : null}
    </form>
  );
}
