"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

/**
 * Manual trigger for the same scheduled-dispatch pass the API's interval timer runs
 * automatically every 30s — lets an admin confirm a just-scheduled message went out without
 * waiting for the next tick.
 */
export function DispatchDueButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [dispatched, setDispatched] = useState<number | null>(null);

  async function onClick() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/catalog/communications/messages/dispatch-due", { method: "POST" });
      const body = (await res.json().catch(() => ({ dispatched: 0 }))) as { dispatched: number };
      setDispatched(body.dispatched);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" isLoading={isLoading} onClick={onClick}>
        Dispatch due messages now
      </Button>
      {dispatched !== null ? <span className="text-xs text-slate-500">Dispatched {dispatched}.</span> : null}
    </div>
  );
}
