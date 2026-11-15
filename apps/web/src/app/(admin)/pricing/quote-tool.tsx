"use client";

import { useState } from "react";
import { Button, Select } from "@kitchenos/ui";

interface QuoteToolProps {
  variants: { id: string; label: string }[];
  outlets: { id: string; name: string }[];
}

interface QuoteResult {
  finalPrice: string;
  selectedRule: { id: string; label: string; category: string; adjustmentType: string; adjustmentValue: string } | null;
  validity: { validFrom: string | null; validTo: string | null } | null;
  breakdown: {
    basePrice: string;
    outletOverride: string | null;
    resolvedBase: string;
    afterRule: string;
    mrpCeiling: string | null;
    mrpCapped: boolean;
    cost: string | null;
    minimumMarginPercent: string;
    marginFloorApplied: boolean;
  };
}

export function QuoteTool({ variants, outlets }: QuoteToolProps) {
  const [variantId, setVariantId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [channel, setChannel] = useState("DINE_IN");
  const [at, setAt] = useState("");
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!variantId || !outletId) {
      setError("Choose a variant and an outlet.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ variantId, outletId, channel });
      if (at) params.set("at", new Date(at).toISOString());
      const res = await fetch(`/api/catalog/pricing/quote?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not get a quote." }))) as { message?: string };
        setError(body.message ?? "Could not get a quote.");
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
        <div>
          <label className="block text-xs font-medium text-slate-600">Outlet</label>
          <Select
            aria-label="Outlet"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Choose an outlet"
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Channel</label>
          <Select
            aria-label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            options={[
              { value: "DINE_IN", label: "Dine-in" },
              { value: "DELIVERY", label: "Delivery" },
              { value: "TAKEAWAY", label: "Takeaway" },
            ]}
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">At (blank = now)</label>
          <input value={at} onChange={(e) => setAt(e.target.value)} type="datetime-local" className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
        </div>
        <Button type="submit" isLoading={isLoading} variant="secondary">
          Get quote
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      {result ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="text-lg font-semibold text-slate-900">Final price: ₹{result.finalPrice}</div>
          <div className="mt-1 text-slate-600">
            Selected rule: {result.selectedRule ? `${result.selectedRule.label} (${result.selectedRule.category})` : "none — plain base price"}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Base price</dt>
              <dd className="font-medium text-slate-900">₹{result.breakdown.basePrice}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Outlet override</dt>
              <dd className="font-medium text-slate-900">{result.breakdown.outletOverride ? `₹${result.breakdown.outletOverride}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">After rule</dt>
              <dd className="font-medium text-slate-900">₹{result.breakdown.afterRule}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">MRP ceiling</dt>
              <dd className="font-medium text-slate-900">
                {result.breakdown.mrpCeiling ? `₹${result.breakdown.mrpCeiling}${result.breakdown.mrpCapped ? " (capped)" : ""}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Cost</dt>
              <dd className="font-medium text-slate-900">{result.breakdown.cost ? `₹${result.breakdown.cost}` : "unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Min. margin</dt>
              <dd className="font-medium text-slate-900">
                {result.breakdown.minimumMarginPercent}%{result.breakdown.marginFloorApplied ? " (floor applied)" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Valid from</dt>
              <dd className="font-medium text-slate-900">
                {result.validity?.validFrom ? new Date(result.validity.validFrom).toLocaleDateString() : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Valid to</dt>
              <dd className="font-medium text-slate-900">
                {result.validity?.validTo ? new Date(result.validity.validTo).toLocaleDateString() : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
