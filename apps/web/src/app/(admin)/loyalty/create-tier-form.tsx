"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function CreateTierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [minLifetimePoints, setMinLifetimePoints] = useState("");
  const [earningMultiplier, setEarningMultiplier] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !minLifetimePoints) {
      setError("Enter a name and a minimum lifetime points threshold.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/loyalty/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          minLifetimePoints: Number(minLifetimePoints),
          earningMultiplier,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not create tier." }))) as { message?: string };
        setError(body.message ?? "Could not create tier.");
        return;
      }
      setName("");
      setMinLifetimePoints("");
      setEarningMultiplier("1");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600">Tier name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Gold"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Min. lifetime points</label>
        <input
          value={minLifetimePoints}
          onChange={(e) => setMinLifetimePoints(e.target.value)}
          type="number"
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">Earning multiplier</label>
        <input
          value={earningMultiplier}
          onChange={(e) => setEarningMultiplier(e.target.value)}
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Add tier
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
