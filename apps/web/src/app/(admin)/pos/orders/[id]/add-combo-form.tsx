"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function AddComboForm({ orderId, availableCombos }: { orderId: string; availableCombos: { id: string; label: string }[] }) {
  const router = useRouter();
  const [comboId, setComboId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comboId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/combo-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboId, quantity: Number(quantity) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add combo." }))) as { message?: string };
        setError(body.message ?? "Could not add combo.");
        return;
      }
      setComboId("");
      setQuantity("1");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableCombos.length === 0) return null;

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
      <Select
        aria-label="Combo"
        value={comboId}
        onChange={(e) => setComboId(e.target.value)}
        options={availableCombos.map((c) => ({ value: c.id, label: c.label }))}
        placeholder="Select a combo"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2">Qty</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 w-20 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" variant="secondary" isLoading={isLoading} disabled={!comboId}>
        Add combo
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
