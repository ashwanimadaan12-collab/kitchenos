"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const CHANNEL_OPTIONS = [
  { value: "ALL", label: "All channels" },
  { value: "DINE_IN", label: "Dine-in" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "TAKEAWAY", label: "Takeaway" },
];

interface AssignOutletFormProps {
  menuId: string;
  availableOutlets: { id: string; name: string }[];
}

export function AssignOutletForm({ menuId, availableOutlets }: AssignOutletFormProps) {
  const router = useRouter();
  const [outletId, setOutletId] = useState("");
  const [channel, setChannel] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!outletId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/menus/${menuId}/outlets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId, channel }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not assign outlet." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not assign outlet.");
        return;
      }
      setOutletId("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (availableOutlets.length === 0) {
    return <p className="text-sm text-slate-400">Every outlet for this brand already runs this menu.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Outlet to assign"
        value={outletId}
        onChange={(e) => setOutletId(e.target.value)}
        options={availableOutlets.map((o) => ({ value: o.id, label: o.name }))}
        placeholder="Select an outlet"
      />
      <Select
        aria-label="Channel"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        options={CHANNEL_OPTIONS}
      />
      <Button type="submit" isLoading={isLoading} variant="secondary" disabled={!outletId}>
        Assign to outlet
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
