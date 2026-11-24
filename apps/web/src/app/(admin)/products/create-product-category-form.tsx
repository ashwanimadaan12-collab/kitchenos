"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CreateProductCategoryForm({ brands }: { brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId) {
      setError("Choose a brand.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create category." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create category.");
        return;
      }
      setName("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Brand"
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="Select a brand"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="category-name">
          Category name
        </label>
        <input
          id="category-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Pizzas"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary">
        Add category
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
