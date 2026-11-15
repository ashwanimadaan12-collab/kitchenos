"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ReorderPointForm({
  kitchenId,
  ingredientId,
  initialValue,
}: {
  kitchenId: string;
  ingredientId: string;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [reorderPoint, setReorderPoint] = useState(initialValue ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/inventory/kitchens/${kitchenId}/reorder-point`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId, reorderPoint: reorderPoint || null }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={reorderPoint}
        onChange={(e) => setReorderPoint(e.target.value)}
        placeholder="none"
        className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <Button type="submit" variant="ghost" isLoading={isLoading}>
        Save
      </Button>
    </form>
  );
}
