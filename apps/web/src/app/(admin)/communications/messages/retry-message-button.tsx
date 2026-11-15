"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function RetryMessageButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function onClick() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/communications/messages/${messageId}/retry`, { method: "POST" });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant="secondary" isLoading={isLoading} onClick={onClick}>
      Retry
    </Button>
  );
}
