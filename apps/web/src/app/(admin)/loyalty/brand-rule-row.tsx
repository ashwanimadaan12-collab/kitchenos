"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function BrandRuleRow({
  brandId,
  brandName,
  earningRate,
  redemptionRatio,
}: {
  brandId: string;
  brandName: string;
  earningRate: string | null;
  redemptionRatio: string | null;
}) {
  const router = useRouter();
  const [earning, setEarning] = useState(earningRate ?? "");
  const [redemption, setRedemption] = useState(redemptionRatio ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function onSave() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/loyalty/brand-rules/${brandId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earningRate: earning || null, redemptionRatio: redemption || null }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2 font-medium text-slate-900">{brandName}</td>
      <td className="px-4 py-2">
        <input
          value={earning}
          onChange={(e) => setEarning(e.target.value)}
          placeholder="org default"
          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={redemption}
          onChange={(e) => setRedemption(e.target.value)}
          placeholder="org default"
          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <Button variant="secondary" isLoading={isLoading} onClick={onSave}>
          Save
        </Button>
      </td>
    </tr>
  );
}
