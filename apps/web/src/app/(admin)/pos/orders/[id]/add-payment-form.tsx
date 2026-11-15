"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

const METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "WALLET", label: "Wallet" },
];

export function AddPaymentForm({ orderId, balanceDue }: { orderId: string; balanceDue: string }) {
  const router = useRouter();
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState(balanceDue);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, amount, referenceNumber: referenceNumber || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not record payment." }))) as {
          message?: string;
        };
        setError(body.message ?? "Could not record payment.");
        return;
      }
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={METHOD_OPTIONS} />
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="payment-amount">
          Amount
        </label>
        <input
          id="payment-amount"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-28 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="payment-reference">
          Reference (optional)
        </label>
        <input
          id="payment-reference"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" isLoading={isLoading}>
        Record payment
      </Button>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
