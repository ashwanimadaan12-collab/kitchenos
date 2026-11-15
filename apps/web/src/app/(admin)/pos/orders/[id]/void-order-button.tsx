"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function VoidOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/void`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not void order." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not void order.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="danger" isLoading={isLoading} onClick={onClick}>
        Void order
      </Button>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
