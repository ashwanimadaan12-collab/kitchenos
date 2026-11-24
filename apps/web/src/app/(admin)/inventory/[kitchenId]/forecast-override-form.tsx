"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ForecastOverrideForm({
  kitchenId,
  ingredientId,
  initialSafetyStock,
  initialLeadTimeDays,
}: {
  kitchenId: string;
  ingredientId: string;
  initialSafetyStock: string | null;
  initialLeadTimeDays: number | null;
}) {
  const router = useRouter();
  const [safetyStock, setSafetyStock] = useState(initialSafetyStock ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(initialLeadTimeDays?.toString() ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/inventory/kitchens/${kitchenId}/forecast/${ingredientId}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safetyStockOverride: safetyStock || null,
          leadTimeDaysOverride: leadTimeDays ? Number(leadTimeDays) : null,
        }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1">
      <input
        value={safetyStock}
        onChange={(e) => setSafetyStock(e.target.value)}
        placeholder="auto"
        title="Safety stock override"
        className="w-16 rounded-md border border-line px-1.5 py-1 text-xs"
      />
      <input
        value={leadTimeDays}
        onChange={(e) => setLeadTimeDays(e.target.value)}
        placeholder="auto"
        title="Lead time override (days)"
        className="w-12 rounded-md border border-line px-1.5 py-1 text-xs"
      />
      <Button type="submit" variant="ghost" isLoading={isLoading}>
        Save
      </Button>
    </form>
  );
}
