"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ReceiveItemForm({ purchaseOrderId, itemId }: { purchaseOrderId: string; itemId: string }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quantity) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/purchase-orders/${purchaseOrderId}/items/${itemId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not receive item." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not receive item.");
        return;
      }
      setQuantity("");
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
        placeholder="qty"
        className="w-20 rounded-md border border-line px-2 py-1 text-sm"
      />
      <Button type="submit" variant="secondary" isLoading={isLoading}>
        Receive
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
