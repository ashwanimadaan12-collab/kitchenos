"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface Settings {
  earningRate: string;
  redemptionRatio: string;
  welcomeBonusPoints: number;
  referralBonusPoints: number;
  birthdayBonusPoints: number;
  pointsExpiryDays: number | null;
}

export function ProgramSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [earningRate, setEarningRate] = useState(settings.earningRate);
  const [redemptionRatio, setRedemptionRatio] = useState(settings.redemptionRatio);
  const [welcomeBonusPoints, setWelcomeBonusPoints] = useState(String(settings.welcomeBonusPoints));
  const [referralBonusPoints, setReferralBonusPoints] = useState(String(settings.referralBonusPoints));
  const [birthdayBonusPoints, setBirthdayBonusPoints] = useState(String(settings.birthdayBonusPoints));
  const [pointsExpiryDays, setPointsExpiryDays] = useState(settings.pointsExpiryDays ? String(settings.pointsExpiryDays) : "");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/loyalty/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          earningRate,
          redemptionRatio,
          welcomeBonusPoints: Number(welcomeBonusPoints),
          referralBonusPoints: Number(referralBonusPoints),
          birthdayBonusPoints: Number(birthdayBonusPoints),
          pointsExpiryDays: pointsExpiryDays ? Number(pointsExpiryDays) : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not save settings." }))) as { message?: string };
        setError(body.message ?? "Could not save settings.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-2">Earning rate (pts per ₹100)</label>
        <input
          value={earningRate}
          onChange={(e) => setEarningRate(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Redemption ratio (₹ per pt)</label>
        <input
          value={redemptionRatio}
          onChange={(e) => setRedemptionRatio(e.target.value)}
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Welcome bonus</label>
        <input
          value={welcomeBonusPoints}
          onChange={(e) => setWelcomeBonusPoints(e.target.value)}
          type="number"
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Referral bonus</label>
        <input
          value={referralBonusPoints}
          onChange={(e) => setReferralBonusPoints(e.target.value)}
          type="number"
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Birthday bonus</label>
        <input
          value={birthdayBonusPoints}
          onChange={(e) => setBirthdayBonusPoints(e.target.value)}
          type="number"
          className="mt-1 w-24 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-2">Points expire after (days)</label>
        <input
          value={pointsExpiryDays}
          onChange={(e) => setPointsExpiryDays(e.target.value)}
          type="number"
          placeholder="never"
          className="mt-1 w-28 rounded-md border border-line px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Save settings
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </form>
  );
}
