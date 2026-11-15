"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function ActionButton({
  path,
  label,
  variant = "secondary",
}: {
  path: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/${path}`, { method: "POST" });
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
      <Button variant={variant} isLoading={isLoading} onClick={onClick}>
        {label}
      </Button>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
