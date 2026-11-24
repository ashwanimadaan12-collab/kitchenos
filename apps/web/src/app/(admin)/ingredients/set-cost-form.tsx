"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface SetCostFormProps {
  ingredientId: string;
  currentCost: string | null;
}

export function SetCostForm({ ingredientId, currentCost }: SetCostFormProps) {
  const router = useRouter();
  const [costPerUnit, setCostPerUnit] = useState(currentCost ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!costPerUnit) return;
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/costing/ingredients/${ingredientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costPerUnit }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={costPerUnit}
        onChange={(e) => setCostPerUnit(e.target.value)}
        placeholder="0.0000"
        className="w-24 rounded-md border border-line px-2 py-1 text-sm"
      />
      <Button type="submit" variant="ghost" isLoading={isLoading}>
        Save
      </Button>
    </form>
  );
}
