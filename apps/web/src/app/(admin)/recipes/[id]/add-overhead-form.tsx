"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function AddOverheadForm({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/costing/recipes/${recipeId}/overheads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, amount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add overhead cost." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not add overhead cost.");
        return;
      }
      setLabel("");
      setAmount("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="overhead-label">
          Label
        </label>
        <input
          id="overhead-label"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Labor"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="overhead-amount">
          Amount
        </label>
        <input
          id="overhead-amount"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="30.00"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary">
        Add overhead cost
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
