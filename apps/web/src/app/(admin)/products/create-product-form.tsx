"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface CreateProductFormProps {
  brands: { id: string; name: string }[];
  categories: { id: string; brandId: string; name: string }[];
  taxCategories: { id: string; name: string }[];
}

export function CreateProductForm({ brands, categories, taxCategories }: CreateProductFormProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [taxCategoryId, setTaxCategoryId] = useState("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [variantName, setVariantName] = useState("Regular");
  const [variantSku, setVariantSku] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const categoryOptions = useMemo(() => categories.filter((c) => c.brandId === brandId), [categories, brandId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId || !categoryId) {
      setError("Choose a brand and category.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          categoryId,
          taxCategoryId: taxCategoryId || undefined,
          name,
          sku,
          variants: [{ name: variantName, sku: variantSku, basePrice }],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create product." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create product.");
        return;
      }
      setName("");
      setSku("");
      setVariantSku("");
      setBasePrice("");
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
          setCategoryId("");
        }}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="Select a brand"
      />
      <Select
        aria-label="Category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        options={categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
        placeholder="Select a category"
        disabled={!brandId}
      />
      <Select
        aria-label="Tax category"
        value={taxCategoryId}
        onChange={(e) => setTaxCategoryId(e.target.value)}
        options={taxCategories.map((t) => ({ value: t.id, label: t.name }))}
        placeholder="No tax category"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="product-name">
          Product name
        </label>
        <input
          id="product-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Margherita"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="product-sku">
          SKU
        </label>
        <input
          id="product-sku"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="PP-MARG"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="variant-name">
          First variant
        </label>
        <input
          id="variant-name"
          required
          value={variantName}
          onChange={(e) => setVariantName(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Regular"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="variant-sku">
          Variant SKU
        </label>
        <input
          id="variant-sku"
          required
          value={variantSku}
          onChange={(e) => setVariantSku(e.target.value.toUpperCase())}
          className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="PP-MARG-REG"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="base-price">
          Base price
        </label>
        <input
          id="base-price"
          required
          inputMode="decimal"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="199.00"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add product
      </Button>
      {error ? <p className="w-full text-sm text-bad">{error}</p> : null}
    </form>
  );
}
