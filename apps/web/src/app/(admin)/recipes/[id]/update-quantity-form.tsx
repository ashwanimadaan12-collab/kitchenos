"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface UpdateQuantityFormProps {
  recipeId: string;
  ingredientId: string;
  initialQuantity: string;
}

export function UpdateQuantityForm({ recipeId, ingredientId, initialQuantity }: UpdateQuantityFormProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/recipes/${recipeId}/ingredients/${ingredientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <Button type="submit" variant="ghost" isLoading={isLoading}>
        Save
      </Button>
    </form>
  );
}
