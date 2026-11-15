"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface AddItemFormProps {
  orderId: string;
  availableVariants: { id: string; label: string }[];
}

export function AddItemForm({ orderId, availableVariants }: AddItemFormProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, quantity: Number(quantity) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add item." }))) as {
          message?: string;
        };
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

  if (availableVariants.length === 0) {
    return <p className="text-sm text-slate-400">No menu items are available to sell at this outlet.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Menu item"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={availableVariants.map((v) => ({ value: v.id, label: v.label }))}
        placeholder="Select a menu item"
      />
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="item-quantity">
          Qty
        </label>
        <input
          id="item-quantity"
          required
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 w-20 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading} disabled={!variantId}>
        Add
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
