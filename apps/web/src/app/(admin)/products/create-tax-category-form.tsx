"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function CreateTaxCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/tax-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ratePercent }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create tax category." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not create tax category.");
        return;
      }
      setName("");
      setRatePercent("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="tax-name">
          Name
        </label>
        <input
          id="tax-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="GST 18%"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="tax-rate">
          Rate %
        </label>
        <input
          id="tax-rate"
          required
          inputMode="decimal"
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="18.00"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary">
        Add tax category
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
