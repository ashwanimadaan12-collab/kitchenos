"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ToggleRuleActiveButton({ ruleId, isActive }: { ruleId: string; isActive: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function onClick() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/pricing/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant={isActive ? "secondary" : "primary"} isLoading={isLoading} onClick={onClick}>
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
