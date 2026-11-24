"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ItemQuantityFormProps {
  orderId: string;
  itemId: string;
  initialQuantity: number;
}

export function ItemQuantityForm({ orderId, itemId, initialQuantity }: ItemQuantityFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function changeBy(delta: number) {
    const next = initialQuantity + delta;
    if (next < 1) return;
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => changeBy(-1)}
        disabled={isLoading}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-ink hover:bg-surface-2 disabled:opacity-50"
        aria-label="Kam karo"
      >
        −
      </button>
      <span className="w-6 text-center text-base font-semibold">{initialQuantity}</span>
      <button
        type="button"
        onClick={() => changeBy(1)}
        disabled={isLoading}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-lg font-bold text-ink hover:bg-surface-2 disabled:opacity-50"
        aria-label="Zyada karo"
      >
        +
      </button>
    </div>
  );
}
