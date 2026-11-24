"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface CreateOutletFormProps {
  brands: { id: string; name: string }[];
}

export function CreateOutletForm({ brands }: CreateOutletFormProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [gstin, setGstin] = useState("");
  const [fssai, setFssai] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brandId) {
      setError("Choose a brand.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/outlets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name,
          code,
          city: city || undefined,
          // Both go on the printed bill. Left blank, the bill prints as a plain
          // receipt instead of a tax invoice, which is correct for a business
          // that is not GST registered.
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : undefined,
          fssaiLicence: fssai.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create outlet." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create outlet.");
        return;
      }
      setName("");
      setCode("");
      setCity("");
      setGstin("");
      setFssai("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-brand">
          Brand
        </label>
        <Select
          id="outlet-brand"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder="Select a brand"
          className="mt-1"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-name">
          Name
        </label>
        <input
          id="outlet-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="Old Monk - Connaught Place"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-code">
          Code
        </label>
        <input
          id="outlet-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="OM-CP-01"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-city">
          City
        </label>
        <input
          id="outlet-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="New Delhi"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-gstin">
          GSTIN (bill pe chhapega)
        </label>
        <input
          id="outlet-gstin"
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
          placeholder="09AAACS1234F1ZQ"
          className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-sm uppercase text-ink"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2" htmlFor="outlet-fssai">
          FSSAI licence
        </label>
        <input
          id="outlet-fssai"
          value={fssai}
          onChange={(e) => setFssai(e.target.value)}
          placeholder="12345678901234"
          inputMode="numeric"
          className="mt-1 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add outlet
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
