"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const KIND_OPTIONS = [
  { value: "RAW_MATERIAL", label: "Raw material" },
  { value: "PACKAGING", label: "Packaging" },
];

const UNIT_OPTIONS = [
  { value: "GRAM", label: "Gram" },
  { value: "KILOGRAM", label: "Kilogram" },
  { value: "MILLILITRE", label: "Millilitre" },
  { value: "LITRE", label: "Litre" },
  { value: "UNIT", label: "Unit" },
  { value: "DOZEN", label: "Dozen" },
];

export function CreateIngredientForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [kind, setKind] = useState("RAW_MATERIAL");
  const [unit, setUnit] = useState("KILOGRAM");
  const [preferredSupplierId, setPreferredSupplierId] = useState("");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          kind,
          unit,
          preferredSupplierId: preferredSupplierId || undefined,
          shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create ingredient." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create ingredient.");
        return;
      }
      setName("");
      setSku("");
      setPreferredSupplierId("");
      setShelfLifeDays("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-name">
          Name
        </label>
        <input
          id="ingredient-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Mozzarella Cheese"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-sku">
          SKU
        </label>
        <input
          id="ingredient-sku"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="ING-MOZZ"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-kind">
          Kind
        </label>
        <Select id="ingredient-kind" value={kind} onChange={(e) => setKind(e.target.value)} options={KIND_OPTIONS} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-unit">
          Unit
        </label>
        <Select id="ingredient-unit" value={unit} onChange={(e) => setUnit(e.target.value)} options={UNIT_OPTIONS} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-supplier">
          Preferred supplier
        </label>
        <Select
          id="ingredient-supplier"
          value={preferredSupplierId}
          onChange={(e) => setPreferredSupplierId(e.target.value)}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="None — org default lead time"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="ingredient-shelf-life">
          Shelf life (days)
        </label>
        <input
          id="ingredient-shelf-life"
          type="number"
          value={shelfLifeDays}
          onChange={(e) => setShelfLifeDays(e.target.value)}
          placeholder="doesn't expire"
          className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add ingredient
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
