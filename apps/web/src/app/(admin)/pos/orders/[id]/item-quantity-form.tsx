"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface ItemQuantityFormProps {
  orderId: string;
  itemId: string;
  initialQuantity: number;
}

export function ItemQuantityForm({ orderId, itemId, initialQuantity }: ItemQuantityFormProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: Number(quantity) }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm"
      />
      <Button type="submit" variant="ghost" isLoading={isLoading}>
        Save
      </Button>
    </form>
  );
}
