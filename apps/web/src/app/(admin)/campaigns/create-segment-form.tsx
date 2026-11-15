"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

type SegmentType = "ALL" | "INACTIVE" | "REPEAT" | "BRAND_PREFERENCE" | "TOTAL_SPEND" | "LOYALTY_TIER" | "BIRTHDAY_THIS_WEEK";

const TYPE_OPTIONS: { value: SegmentType; label: string }[] = [
  { value: "ALL", label: "Everyone" },
  { value: "INACTIVE", label: "Inactive for N+ days" },
  { value: "REPEAT", label: "Repeat customers (N+ paid orders)" },
  { value: "BRAND_PREFERENCE", label: "Prefers a brand" },
  { value: "TOTAL_SPEND", label: "Total spend at or above" },
  { value: "LOYALTY_TIER", label: "In a loyalty tier" },
  { value: "BIRTHDAY_THIS_WEEK", label: "Birthday this week" },
];

interface CreateSegmentFormProps {
  brands: { id: string; name: string }[];
  loyaltyTiers: { id: string; name: string }[];
}

export function CreateSegmentForm({ brands, loyaltyTiers }: CreateSegmentFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<SegmentType>("ALL");
  const [inactiveDays, setInactiveDays] = useState("90");
  const [minOrders, setMinOrders] = useState("2");
  const [brandId, setBrandId] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [loyaltyTierId, setLoyaltyTierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) {
      setError("Enter a segment name.");
      return;
    }
    if (type === "BRAND_PREFERENCE" && !brandId) {
      setError("Choose a brand.");
      return;
    }
    if (type === "LOYALTY_TIER" && !loyaltyTierId) {
      setError("Choose a loyalty tier.");
      return;
    }
    if (type === "TOTAL_SPEND" && !minSpend) {
      setError("Enter a minimum spend.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = { name, type };
      if (type === "INACTIVE") payload.inactiveDays = Number(inactiveDays);
      if (type === "REPEAT") payload.minOrders = Number(minOrders);
      if (type === "BRAND_PREFERENCE") payload.brandId = brandId;
      if (type === "TOTAL_SPEND") payload.minSpend = minSpend;
      if (type === "LOYALTY_TIER") payload.loyaltyTierId = loyaltyTierId;

      const res = await fetch("/api/catalog/customer-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create segment." }))) as { message?: string };
        setError(body.message ?? "Could not create segment.");
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
      <div>
        <label className="block text-xs font-medium text-slate-600">Segment name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-48 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Lapsed regulars"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Type</label>
        <Select
          aria-label="Segment type"
          value={type}
          onChange={(e) => setType(e.target.value as SegmentType)}
          options={TYPE_OPTIONS}
          className="mt-1"
        />
      </div>

      {type === "INACTIVE" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600">Inactive days</label>
          <input
            value={inactiveDays}
            onChange={(e) => setInactiveDays(e.target.value)}
            type="number"
            className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
      ) : null}
      {type === "REPEAT" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600">Min. paid orders</label>
          <input
            value={minOrders}
            onChange={(e) => setMinOrders(e.target.value)}
            type="number"
            className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          />
        </div>
      ) : null}
      {type === "BRAND_PREFERENCE" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600">Brand</label>
          <Select
            aria-label="Brand"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Choose a brand"
            className="mt-1"
          />
        </div>
      ) : null}
      {type === "TOTAL_SPEND" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600">Min. total spend (₹)</label>
          <input
            value={minSpend}
            onChange={(e) => setMinSpend(e.target.value)}
            className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="5000"
          />
        </div>
      ) : null}
      {type === "LOYALTY_TIER" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600">Loyalty tier</label>
          <Select
            aria-label="Loyalty tier"
            value={loyaltyTierId}
            onChange={(e) => setLoyaltyTierId(e.target.value)}
            options={loyaltyTiers.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Choose a tier"
            className="mt-1"
          />
        </div>
      ) : null}

      <Button type="submit" isLoading={isLoading}>
        Add segment
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
