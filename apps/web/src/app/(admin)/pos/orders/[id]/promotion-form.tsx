"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function PromotionForm({
  orderId,
  appliedCode,
}: {
  orderId: string;
  appliedCode: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/promotion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not apply promotion code." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not apply promotion code.");
        return;
      }
      setCode("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  async function onRemove() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/orders/${orderId}/promotion`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (appliedCode) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-ink-2">
          Promotion applied: <span className="font-medium text-ink">{appliedCode}</span>
        </span>
        <Button type="button" variant="ghost" isLoading={isLoading} onClick={onRemove}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onApply} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-2">Promotion code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-40 rounded-md border border-line px-3 py-1.5 text-sm uppercase"
          placeholder="WELCOME10"
        />
      </div>
      <Button type="submit" variant="secondary" isLoading={isLoading}>
        Apply
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
