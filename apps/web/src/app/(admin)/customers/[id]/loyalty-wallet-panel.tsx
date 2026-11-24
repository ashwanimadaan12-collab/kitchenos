"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface Wallet {
  balance: number;
  lifetimePoints: number;
  tier: { name: string; earningMultiplier: string } | null;
  nextTier: { name: string; pointsNeeded: number } | null;
}

interface Transaction {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export function LoyaltyWalletPanel({
  customerId,
  wallet,
  transactions,
}: {
  customerId: string;
  wallet: Wallet;
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!points || !note) {
      setError("Enter a point amount (positive or negative) and a note.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/customers/${customerId}/loyalty/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Number(points), note }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not record adjustment." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not record adjustment.");
        return;
      }
      setPoints("");
      setNote("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Loyalty wallet</h2>
      <div className="mt-3 flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-xs text-ink-2">Balance</div>
          <div className="text-lg font-semibold text-ink">{wallet.balance} pts</div>
        </div>
        <div>
          <div className="text-xs text-ink-2">Lifetime points</div>
          <div className="text-lg font-semibold text-ink">{wallet.lifetimePoints} pts</div>
        </div>
        <div>
          <div className="text-xs text-ink-2">Tier</div>
          <div className="text-lg font-semibold text-ink">{wallet.tier?.name ?? "—"}</div>
        </div>
        {wallet.nextTier ? (
          <div>
            <div className="text-xs text-ink-2">Next tier</div>
            <div className="text-sm text-ink-2">
              {wallet.nextTier.pointsNeeded} pts to {wallet.nextTier.name}
            </div>
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <div>
          <label className="block text-xs font-medium text-ink-2">Manual adjustment</label>
          <input
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            type="number"
            className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="±points"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-2">Note</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-56 rounded-md border border-line px-3 py-1.5 text-sm"
            placeholder="Reason for the adjustment"
          />
        </div>
        <Button type="submit" variant="secondary" isLoading={isLoading}>
          Apply
        </Button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </form>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Points</th>
            <th className="px-4 py-2">Balance after</th>
            <th className="px-4 py-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-t border-line">
              <td className="px-4 py-2 text-ink-2">{new Date(tx.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-ink">{tx.type}</td>
              <td className={`px-4 py-2 ${tx.points >= 0 ? "text-good" : "text-bad"}`}>
                {tx.points >= 0 ? "+" : ""}
                {tx.points}
              </td>
              <td className="px-4 py-2 text-ink-2">{tx.balanceAfter}</td>
              <td className="px-4 py-2 text-ink-2">{tx.note ?? "—"}</td>
            </tr>
          ))}
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No loyalty activity yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
