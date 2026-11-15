"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

export function CustomerForm({
  orderId,
  customers,
  linkedCustomer,
}: {
  orderId: string;
  customers: { id: string; label: string }[];
  linkedCustomer: { name: string; loyaltyPoints: number } | null;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not link customer." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not link customer.");
        return;
      }
      setCustomerId("");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  async function onRemove() {
    setIsLoading(true);
    try {
      await fetch(`/api/catalog/orders/${orderId}/customer`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  if (linkedCustomer) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-600">
          Customer: <span className="font-medium text-slate-900">{linkedCustomer.name}</span> (
          {linkedCustomer.loyaltyPoints} loyalty points)
        </span>
        <Button type="button" variant="ghost" isLoading={isLoading} onClick={onRemove}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onAssign} className="flex flex-wrap items-end gap-3">
      <Select
        aria-label="Customer"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        options={customers.map((c) => ({ value: c.id, label: c.label }))}
        placeholder="Link a customer"
      />
      <Button type="submit" variant="secondary" isLoading={isLoading} disabled={!customerId}>
        Link
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
