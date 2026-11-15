"use client";

import { useState } from "react";
import { Button, Select } from "@kitchenos/ui";

interface MinimumPriceResult {
  basePrice: string;
  cost: string | null;
  minimumMarginPercent: string;
  minimumProfitablePrice: string | null;
}

export function MinimumPriceTool({ variants }: { variants: { id: string; label: string }[] }) {
  const [variantId, setVariantId] = useState("");
  const [result, setResult] = useState<MinimumPriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId) {
      setError("Choose a variant.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/catalog/promotions/recommendations/minimum-price/${variantId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not compute a minimum price." }))) as { message?: string };
        setError(body.message ?? "Could not compute a minimum price.");
        return;
      }
      setResult(await res.json());
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">Variant</label>
          <Select
            aria-label="Variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={variants.map((v) => ({ value: v.id, label: v.label }))}
            placeholder="Choose a variant"
            className="mt-1"
          />
        </div>
        <Button type="submit" variant="secondary" isLoading={isLoading}>
          Check
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      {result ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Base price</dt>
            <dd className="font-medium text-slate-900">₹{result.basePrice}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cost</dt>
            <dd className="font-medium text-slate-900">{result.cost ? `₹${result.cost}` : "unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Min. margin</dt>
            <dd className="font-medium text-slate-900">{result.minimumMarginPercent}%</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Minimum profitable price</dt>
            <dd className="font-medium text-slate-900">{result.minimumProfitablePrice ? `₹${result.minimumProfitablePrice}` : "—"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
