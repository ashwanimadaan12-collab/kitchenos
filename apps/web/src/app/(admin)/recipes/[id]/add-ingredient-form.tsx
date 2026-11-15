"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface AddIngredientFormProps {
  recipeId: string;
  availableIngredients: { id: string; label: string }[];
}

export function AddIngredientForm({ recipeId, availableIngredients }: AddIngredientFormProps) {
  const router = useRouter();
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/recipes/${recipeId}/ingredients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId, quantity }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add ingredient." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not add ingredient.");
        return;
      }
      setIngredientId("");
      setQuantity("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableIngredients.length === 0) {
    return <p className="text-sm text-slate-400">Every ingredient is already on this recipe.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Ingredient"
        value={ingredientId}
        onChange={(e) => setIngredientId(e.target.value)}
        options={availableIngredients.map((i) => ({ value: i.id, label: i.label }))}
        placeholder="Select an ingredient"
      />
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-quantity">
          Quantity
        </label>
        <input
          id="ingredient-quantity"
          required
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="0.300"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!ingredientId}>
        Add to recipe
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
