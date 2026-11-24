"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CreatePromotionForm({ brands }: { brands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [brandId, setBrandId] = useState("");
  const [type, setType] = useState<"PERCENTAGE" | "FLAT">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minOrderSubtotal, setMinOrderSubtotal] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !value) {
      setError("Enter a code and a discount value.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.toUpperCase(),
          brandId: brandId || undefined,
          type,
          value,
          minOrderSubtotal: minOrderSubtotal || undefined,
          maxDiscountAmount: maxDiscountAmount || undefined,
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create promotion." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create promotion.");
        return;
      }
      setCode("");
      setBrandId("");
      setValue("");
      setMinOrderSubtotal("");
      setMaxDiscountAmount("");
      setUsageLimit("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-2">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-32 rounded-md border border-line px-3 py-1.5 text-sm uppercase"
          placeholder="WELCOME10"
        />
      </div>
      <Select
        aria-label="Brand"
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="All brands"
      />
      <Select
        aria-label="Type"
        value={type}
        onChange={(e) => setType(e.target.value as "PERCENTAGE" | "FLAT")}
        options={[
          { value: "PERCENTAGE", label: "Percentage" },
          { value: "FLAT", label: "Flat amount" },
        ]}
      />
      <div>
        <label className="block text-xs font-medium text-ink-2">Value</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder={type === "PERCENTAGE" ? "10" : "50.00"}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Min. subtotal</label>
        <input
          value={minOrderSubtotal}
          onChange={(e) => setMinOrderSubtotal(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="optional"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Max discount</label>
        <input
          value={maxDiscountAmount}
          onChange={(e) => setMaxDiscountAmount(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="optional"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Usage limit</label>
        <input
          value={usageLimit}
          onChange={(e) => setUsageLimit(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="unlimited"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add promotion
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
