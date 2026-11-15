"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ClockButton({ employeeId, isClockedIn }: { employeeId: string; isClockedIn: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsLoading(true);
    try {
      const path = isClockedIn ? "clock-out" : "clock-in";
      const res = await fetch(`/api/catalog/employees/${employeeId}/${path}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Action failed." }))) as { message?: string };
        setError(body.message ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <Button variant={isClockedIn ? "secondary" : "primary"} isLoading={isLoading} onClick={onClick}>
        {isClockedIn ? "Clock out" : "Clock in"}
      </Button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
