"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function AddVariantForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [isRetailCommodity, setIsRetailCommodity] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [landedCost, setLandedCost] = useState("");
  const [printedMRP, setPrintedMRP] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/products/${productId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          basePrice,
          kind: isRetailCommodity ? "RETAIL_COMMODITY" : "PREPARED_FOOD",
          purchasePrice: isRetailCommodity ? purchasePrice || undefined : undefined,
          supplierPrice: isRetailCommodity ? supplierPrice || undefined : undefined,
          landedCost: isRetailCommodity ? landedCost || undefined : undefined,
          printedMRP: isRetailCommodity ? printedMRP || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add variant." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not add variant.");
        return;
      }
      setName("");
      setSku("");
      setBasePrice("");
      setPurchasePrice("");
      setSupplierPrice("");
      setLandedCost("");
      setPrintedMRP("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="variant-name">
            Name
          </label>
          <input
            id="variant-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="Large"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="variant-sku">
            SKU
          </label>
          <input
            id="variant-sku"
            required
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="PP-MARG-L"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="variant-price">
            Base price
          </label>
          <input
            id="variant-price"
            required
            inputMode="decimal"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="499.00"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={isRetailCommodity} onChange={(e) => setIsRetailCommodity(e.target.checked)} />
          Pre-packaged retail commodity
        </label>
        <Button type="submit" isLoading={isLoading} variant="secondary">
          Add variant
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      {isRetailCommodity ? (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Purchase price</label>
            <input
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              placeholder="9.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Supplier price</label>
            <input
              value={supplierPrice}
              onChange={(e) => setSupplierPrice(e.target.value)}
              className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              placeholder="9.50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Landed cost</label>
            <input
              value={landedCost}
              onChange={(e) => setLandedCost(e.target.value)}
              className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              placeholder="10.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Printed MRP</label>
            <input
              value={printedMRP}
              onChange={(e) => setPrintedMRP(e.target.value)}
              className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              placeholder="20.00"
            />
          </div>
        </div>
      ) : null}
    </form>
  );
}
