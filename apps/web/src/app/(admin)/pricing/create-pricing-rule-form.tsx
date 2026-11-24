"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const CATEGORY_OPTIONS = [
  { value: "TIME_BASED", label: "Time-based (e.g. midnight)" },
  { value: "WEEKEND", label: "Weekend" },
  { value: "FESTIVAL", label: "Festival" },
  { value: "CHANNEL", label: "Channel-specific" },
  { value: "OUTLET", label: "Outlet-specific" },
  { value: "SCHEDULED_DISCOUNT", label: "Scheduled discount" },
  { value: "DEMAND_BASED", label: "Demand-based promotion" },
];

const ADJUSTMENT_OPTIONS = [
  { value: "FIXED_PRICE", label: "Fixed price (₹)" },
  { value: "PERCENT_DISCOUNT", label: "Percent discount (%)" },
  { value: "FLAT_DISCOUNT", label: "Flat discount (₹)" },
  { value: "PERCENT_SURCHARGE", label: "Percent surcharge (%)" },
  { value: "FLAT_SURCHARGE", label: "Flat surcharge (₹)" },
];

const DAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface CreatePricingRuleFormProps {
  variants: { id: string; label: string }[];
  outlets: { id: string; name: string }[];
  defaultVariantId?: string;
}

export function CreatePricingRuleForm({ variants, outlets, defaultVariantId }: CreatePricingRuleFormProps) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(defaultVariantId ?? "");
  const [outletId, setOutletId] = useState("");
  const [channel, setChannel] = useState("");
  const [category, setCategory] = useState("SCHEDULED_DISCOUNT");
  const [label, setLabel] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("FLAT_DISCOUNT");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [priority, setPriority] = useState("0");
  const [approvedOverride, setApprovedOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label || !adjustmentValue) {
      setError("Enter a label and an adjustment value.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/pricing/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variantId || undefined,
          outletId: outletId || undefined,
          channel: channel || undefined,
          category,
          label,
          daysOfWeek,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
          validTo: validTo ? new Date(validTo).toISOString() : undefined,
          adjustmentType,
          adjustmentValue,
          priority: Number(priority),
          approvedOverride,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create pricing rule." }))) as { message?: string };
        setError(body.message ?? "Could not create pricing rule.");
        return;
      }
      setLabel("");
      setAdjustmentValue("");
      setDaysOfWeek([]);
      setStartTime("");
      setEndTime("");
      setValidFrom("");
      setValidTo("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-2">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-56 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="Weekend surcharge"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Category</label>
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORY_OPTIONS} className="mt-1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Variant (blank = all)</label>
          <Select
            aria-label="Variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={variants.map((v) => ({ value: v.id, label: v.label }))}
            placeholder="Every variant"
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Outlet (blank = all)</label>
          <Select
            aria-label="Outlet"
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Every outlet"
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Channel (blank = all)</label>
          <Select
            aria-label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            options={[
              { value: "DINE_IN", label: "Dine-in" },
              { value: "DELIVERY", label: "Delivery" },
              { value: "TAKEAWAY", label: "Takeaway" },
            ]}
            placeholder="Every channel"
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-2">Days (blank = every day)</label>
          <div className="mt-1 flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  daysOfWeek.includes(d.value) ? "bg-brand text-white" : "bg-surface-2 text-ink-2"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Start time (HH:mm)</label>
          <input
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="22:00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">End time (HH:mm)</label>
          <input
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="06:00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Valid from</label>
          <input
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            type="date"
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Valid to</label>
          <input
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            type="date"
            className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-2">Adjustment</label>
          <Select
            aria-label="Adjustment type"
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value)}
            options={ADJUSTMENT_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Value</label>
          <input
            value={adjustmentValue}
            onChange={(e) => setAdjustmentValue(e.target.value)}
            className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="10.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Priority</label>
          <input
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            type="number"
            className="mt-1 w-20 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-2">
          <input type="checkbox" checked={approvedOverride} onChange={(e) => setApprovedOverride(e.target.checked)} />
          Approve below the margin floor
        </label>
        <Button type="submit" isLoading={isLoading}>
          Add pricing rule
        </Button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    </form>
  );
}
