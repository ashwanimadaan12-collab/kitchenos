"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function PricingSettingsForm({ minimumMarginPercent }: { minimumMarginPercent: string }) {
  const router = useRouter();
  const [value, setValue] = useState(minimumMarginPercent);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/pricing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minimumMarginPercent: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not update settings." }))) as { message?: string };
        setError(body.message ?? "Could not update settings.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600">Minimum margin (%)</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="0"
        />
      </div>
      <Button type="submit" isLoading={isLoading} variant="secondary">
        Save
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
