"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

export function UnmapButton({ path, label = "Unmap" }: { path: string; label?: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function onClick() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/${path}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant="ghost" isLoading={isLoading} onClick={onClick}>
      {label}
    </Button>
  );
}
