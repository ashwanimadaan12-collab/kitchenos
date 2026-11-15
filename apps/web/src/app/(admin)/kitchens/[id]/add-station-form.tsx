"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function AddStationForm({ kitchenId }: { kitchenId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/kitchens/${kitchenId}/stations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not add station." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not add station.");
        return;
      }
      setName("");
      setCode("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="station-name">
          Station name
        </label>
        <input
          id="station-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Grill"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="station-code">
          Code
        </label>
        <input
          id="station-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="GRILL-01"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary">
        Add station
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
