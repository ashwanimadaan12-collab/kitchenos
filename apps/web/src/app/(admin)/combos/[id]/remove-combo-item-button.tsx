"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function RemoveComboItemButton({
  comboId,
  variantId,
  disabled,
}: {
  comboId: string;
  variantId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/combos/${comboId}/items/${variantId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not remove item." }))) as { message?: string };
        setError(body.message ?? "Could not remove item.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <Button variant="danger" isLoading={isLoading} onClick={onClick} disabled={disabled}>
        Remove
      </Button>
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : null}
    </div>
  );
}
