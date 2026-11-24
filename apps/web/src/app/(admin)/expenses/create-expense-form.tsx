"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const CATEGORIES = ["RENT", "UTILITIES", "SALARY", "MARKETING", "MAINTENANCE", "OTHER"];

export function CreateExpenseForm({ outlets }: { outlets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !incurredAt) {
      setError("Enter an amount and date.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId: outletId || undefined,
          category,
          description: description || undefined,
          amount,
          incurredAt,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not record expense." }))) as { message?: string };
        setError(body.message ?? "Could not record expense.");
        return;
      }
      setOutletId("");
      setDescription("");
      setAmount("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-2">Date</label>
        <input
          type="date"
          value={incurredAt}
          onChange={(e) => setIncurredAt(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Select
        aria-label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        options={CATEGORIES.map((c) => ({ value: c, label: c }))}
      />
      <Select
        aria-label="Outlet"
        value={outletId}
        onChange={(e) => setOutletId(e.target.value)}
        options={outlets.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="Organization-wide"
      />
      <div>
        <label className="block text-xs font-medium text-ink-2">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="optional"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Amount</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
          placeholder="2500.00"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Record expense
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
