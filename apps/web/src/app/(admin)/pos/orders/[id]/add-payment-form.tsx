"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const METHODS = [
  { value: "CASH", label: "Cash", icon: "\u{1F4B5}" },
  { value: "CARD", label: "Card", icon: "\u{1F4B3}" },
  { value: "UPI", label: "UPI", icon: "\u{1F4F1}" },
  { value: "WALLET", label: "Wallet", icon: "\u{1F45B}" },
];

export function AddPaymentForm({ orderId, balanceDue }: { orderId: string; balanceDue: string }) {
  const router = useRouter();
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState(balanceDue);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(method: string) {
    setError(null);
    setLoadingMethod(method);
    try {
      const amount = showCustomAmount ? customAmount : balanceDue;
      const res = await fetch(`/api/catalog/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, amount, referenceNumber: referenceNumber || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Payment record nahi ho paaya." }))) as {
          message?: string;
        };
        setError(body.message ?? "Payment record nahi ho paaya.");
        return;
      }
      router.refresh();
    } finally {
      setLoadingMethod(null);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-700">
        Pura amount <span className="font-semibold text-slate-900">₹{balanceDue}</span> — kis tarike se liya?
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => pay(m.value)}
            disabled={loadingMethod !== null}
            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-5 text-center text-base font-semibold text-slate-900 shadow-sm transition hover:border-slate-900 hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            <span className="block text-2xl">{loadingMethod === m.value ? "…" : m.icon}</span>
            <span className="mt-1 block">{m.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowCustomAmount((v) => !v)}
        className="mt-3 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        {showCustomAmount ? "− Pura amount hi lo" : "+ Alag amount / reference number"}
      </button>

      {showCustomAmount ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="payment-amount">
              Amount
            </label>
            <input
              id="payment-amount"
              inputMode="decimal"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
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
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
