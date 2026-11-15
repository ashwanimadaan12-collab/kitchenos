"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function LoyaltyRedemptionForm({
  orderId,
  availablePoints,
  pointsRedeemed,
}: {
  orderId: string;
  availablePoints: number;
  pointsRedeemed: number;
}) {
  const router = useRouter();
  const [points, setPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onApply(e: React.FormEvent) {
    e.preventDefault();
    if (!points) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/loyalty-redemption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(points) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not redeem points." }))) as { message?: string };
        setError(body.message ?? "Could not redeem points.");
        return;
      }
      setPoints("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  async function onRemove() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/orders/${orderId}/loyalty-redemption`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (pointsRedeemed > 0) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-600">
          Loyalty points redeemed: <span className="font-medium text-slate-900">{pointsRedeemed}</span>
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
        <label className="block text-xs font-medium text-slate-600">Redeem loyalty points ({availablePoints} available)</label>
        <input
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          type="number"
          min={1}
          max={availablePoints}
          className="mt-1 w-32 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="0"
        />
      </div>
      <Button type="submit" variant="secondary" isLoading={isLoading} disabled={availablePoints <= 0}>
        Redeem
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
