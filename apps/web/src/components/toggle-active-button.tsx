"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface ToggleActiveButtonProps {
  /** Path under /api/catalog, e.g. "brands/abc123". */
  path: string;
  isActive: boolean;
}

export function ToggleActiveButton({ path, isActive }: ToggleActiveButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function onClick() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/${path}`, {
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
