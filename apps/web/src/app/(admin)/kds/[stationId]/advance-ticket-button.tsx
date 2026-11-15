"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function AdvanceTicketButton({
  ticketId,
  nextStatus,
  label,
}: {
  ticketId: string;
  nextStatus: "IN_PROGRESS" | "READY" | "SERVED";
  label: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function onClick() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/kds/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant="primary" isLoading={isLoading} onClick={onClick} className="w-full">
      {label}
    </Button>
  );
}
