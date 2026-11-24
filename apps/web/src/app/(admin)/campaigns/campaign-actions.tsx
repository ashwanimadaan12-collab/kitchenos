"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface CampaignActionsProps {
  campaignId: string;
  status: "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
}

export function CampaignActions({ campaignId, status }: CampaignActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "dispatch" | "cancel") {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/campaigns/${campaignId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Request failed." }))) as { message?: string };
        setError(body.message ?? "Request failed.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (status !== "DRAFT" && status !== "SCHEDULED") return null;

  return (
    <div className="flex items-center gap-2">
      <Button isLoading={isLoading} onClick={() => act("dispatch")}>
        Dispatch now
      </Button>
      <Button variant="secondary" isLoading={isLoading} onClick={() => act("cancel")}>
        Cancel
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
