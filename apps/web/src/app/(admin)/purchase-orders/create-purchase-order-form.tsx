"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface ItemRow {
  ingredientId: string;
  quantityOrdered: string;
  unitCost: string;
}

const EMPTY_ROW: ItemRow = { ingredientId: "", quantityOrdered: "", unitCost: "" };

export function CreatePurchaseOrderForm({
  suppliers,
  kitchens,
  ingredients,
}: {
  suppliers: { id: string; name: string }[];
  kitchens: { id: string; name: string }[];
  ingredients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [kitchenId, setKitchenId] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || !kitchenId) {
      setError("Choose a supplier and a kitchen.");
      return;
    }
    const items = rows.filter((r) => r.ingredientId && r.quantityOrdered && r.unitCost);
    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, kitchenId, items }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create purchase order." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create purchase order.");
        return;
      }
      setSupplierId("");
      setKitchenId("");
      setRows([EMPTY_ROW]);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          aria-label="Supplier"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Select a supplier"
        />
        <Select
          aria-label="Kitchen"
          value={kitchenId}
          onChange={(e) => setKitchenId(e.target.value)}
          options={kitchens.map((k) => ({ value: k.id, label: k.name }))}
          placeholder="Select a kitchen"
        />
      </div>

      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-3">
          <Select
            aria-label="Ingredient"
            value={row.ingredientId}
            onChange={(e) => updateRow(index, { ingredientId: e.target.value })}
            options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
            placeholder="Select an ingredient"
          />
          <div>
            <label className="block text-xs font-medium text-ink-2">Quantity</label>
            <input
              value={row.quantityOrdered}
              onChange={(e) => updateRow(index, { quantityOrdered: e.target.value })}
              className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
              placeholder="50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-2">Unit cost</label>
            <input
              value={row.unitCost}
              onChange={(e) => updateRow(index, { unitCost: e.target.value })}
              className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
              placeholder="58.00"
            />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setRows((prev) => [...prev, EMPTY_ROW])}>
          + Add another item
        </Button>
        <Button type="submit" isLoading={isLoading}>
          Create purchase order
        </Button>
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
