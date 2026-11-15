"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface ItemRow {
  variantId: string;
  quantity: string;
}

const EMPTY_ROW: ItemRow = { variantId: "", quantity: "1" };

export function CreateComboForm({
  brands,
  products,
}: {
  brands: { id: string; name: string }[];
  products: { id: string; brandId: string; name: string; variants: { id: string; name: string }[] }[];
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [comboPrice, setComboPrice] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([EMPTY_ROW, EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const variantOptions = products
    .filter((p) => p.brandId === brandId)
    .flatMap((p) => p.variants.map((v) => ({ value: v.id, label: `${p.name} — ${v.name}` })));

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId || !name || !comboPrice) {
      setError("Choose a brand, name and price.");
      return;
    }
    const items = rows
      .filter((r) => r.variantId && r.quantity)
      .map((r) => ({ variantId: r.variantId, quantity: Number(r.quantity) }));
    if (items.length < 2) {
      setError("A combo needs at least two component items.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, name, comboPrice, items }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create combo." }))) as { message?: string };
        setError(body.message ?? "Could not create combo.");
        return;
      }
      setBrandId("");
      setName("");
      setComboPrice("");
      setRows([EMPTY_ROW, EMPTY_ROW]);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          aria-label="Brand"
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setRows([EMPTY_ROW, EMPTY_ROW]);
          }}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder="Select a brand"
        />
        <div>
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="Pizza + Coke Combo"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Combo price</label>
          <input
            value={comboPrice}
            onChange={(e) => setComboPrice(e.target.value)}
            className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="299.00"
          />
        </div>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-3">
          <Select
            aria-label="Component variant"
            value={row.variantId}
            onChange={(e) => updateRow(index, { variantId: e.target.value })}
            options={variantOptions}
            placeholder={brandId ? "Select a variant" : "Select a brand first"}
          />
          <div>
            <label className="block text-xs font-medium text-slate-600">Quantity</label>
            <input
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: e.target.value })}
              className="mt-1 w-20 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              placeholder="1"
            />
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setRows((prev) => [...prev, EMPTY_ROW])}>
          + Add another item
        </Button>
        <Button type="submit" isLoading={isLoading}>
          Create combo
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
