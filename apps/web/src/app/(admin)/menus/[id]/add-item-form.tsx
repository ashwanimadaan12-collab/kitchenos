"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface AddItemFormProps {
  menuId: string;
  availableVariants: { id: string; label: string }[];
}

export function AddItemForm({ menuId, availableVariants }: AddItemFormProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/menus/${menuId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add item." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not add item.");
        return;
      }
      setVariantId("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableVariants.length === 0) {
    return <p className="text-sm text-slate-400">Every variant for this brand is already on the menu.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Variant to add"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={availableVariants.map((v) => ({ value: v.id, label: v.label }))}
        placeholder="Select a variant"
      />
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!variantId}>
        Add to menu
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
