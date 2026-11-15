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
        body: JSON.stringify({ brandId, name, code, city: city || undefined }),
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
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="outlet-brand">
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
        <label className="block text-xs font-medium text-slate-600" htmlFor="outlet-name">
          Name
        </label>
        <input
          id="outlet-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Old Monk - Connaught Place"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="outlet-code">
          Code
        </label>
        <input
          id="outlet-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="OM-CP-01"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="outlet-city">
          City
        </label>
        <input
          id="outlet-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="New Delhi"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add outlet
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
