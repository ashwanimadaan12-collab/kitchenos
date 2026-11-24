"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface CreateRecipeFormProps {
  brands: { id: string; name: string }[];
  products: { id: string; brandId: string; name: string; variants: { id: string; name: string }[] }[];
  stations: { id: string; label: string }[];
  variantIdsWithRecipes: string[];
}

export function CreateRecipeForm({ brands, products, stations, variantIdsWithRecipes }: CreateRecipeFormProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [stationId, setStationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const recipeless = useMemo(() => new Set(variantIdsWithRecipes), [variantIdsWithRecipes]);
  const productOptions = useMemo(() => products.filter((p) => p.brandId === brandId), [products, brandId]);
  const variantOptions = useMemo(
    () => (products.find((p) => p.id === productId)?.variants ?? []).filter((v) => !recipeless.has(v.id)),
    [products, productId, recipeless],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) {
      setError("Choose a variant.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, preparationStationId: stationId || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create recipe." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create recipe.");
        return;
      }
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
        onChange={(e) => {
          setBrandId(e.target.value);
          setProductId("");
          setVariantId("");
        }}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="Select a brand"
      />
      <Select
        aria-label="Product"
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setVariantId("");
        }}
        options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
        placeholder="Select a product"
        disabled={!brandId}
      />
      <Select
        aria-label="Variant"
        value={variantId}
        onChange={(e) => setVariantId(e.target.value)}
        options={variantOptions.map((v) => ({ value: v.id, label: v.name }))}
        placeholder="Select a variant without a recipe"
        disabled={!productId}
      />
      <Select
        aria-label="Preparation station"
        value={stationId}
        onChange={(e) => setStationId(e.target.value)}
        options={stations.map((s) => ({ value: s.id, label: s.label }))}
        placeholder="No preparation station"
      />
      <Button type="submit" isLoading={isLoading} disabled={!variantId}>
        Add recipe
      </Button>
      {error ? <p className="w-full text-sm text-bad">{error}</p> : null}
    </form>
  );
}
