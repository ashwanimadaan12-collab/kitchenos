"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { paiseToRupees, splitHalf, toPaise } from "@kitchenos/shared";

const METHODS = [
  { value: "CASH", label: "Cash", icon: "\u{1F4B5}" },
  { value: "CARD", label: "Card", icon: "\u{1F4B3}" },
  { value: "UPI", label: "UPI", icon: "\u{1F4F1}" },
  { value: "WALLET", label: "Wallet", icon: "\u{1F45B}" },
] as const;

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  WALLET: "Wallet",
};

interface TakenPayment {
  id: string;
  method: string;
  amount: string;
  referenceNumber: string | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

export function AddPaymentForm({
  orderId,
  balanceDue,
  payments,
}: {
  orderId: string;
  balanceDue: string;
  payments: TakenPayment[];
}) {
  const router = useRouter();
  const balancePaise = toPaise(balanceDue);

  // Empty means "whatever is still due" — the common case is one tap on a method with
  // nothing typed at all, so an empty box must not mean zero.
  const [typed, setTyped] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [showReference, setShowReference] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payPaise = typed === "" ? balancePaise : toPaise(typed);
  const leftoverPaise = balancePaise - payPaise;
  const isPartial = payPaise > 0 && leftoverPaise > 0;
  const isOverpay = leftoverPaise < 0;

  function press(key: string) {
    setError(null);
    if (key === "del") {
      setTyped((v) => v.slice(0, -1));
      return;
    }
    if (key === "." && typed.includes(".")) return;
    // Two decimal places is the whole of the rupee; a third digit is a mis-tap.
    if ((typed.split(".")[1] ?? "").length >= 2) return;
    setTyped((v) => (v === "0" && key !== "." ? key : v + key));
  }

  async function pay(method: string) {
    if (payPaise <= 0) {
      setError("Amount daalo.");
      return;
    }
    setError(null);
    setBusy(method);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          amount: paiseToRupees(payPaise),
          referenceNumber: referenceNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "Payment record nahi ho paaya.");
        return;
      }
      setTyped("");
      setReferenceNumber("");
      setShowReference(false);
      router.refresh();
    } catch {
      setError("Network nahi mila. Dobara try karo.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(paymentId: string) {
    setError(null);
    setBusy(`undo:${paymentId}`);
    try {
      const res = await fetch(`/api/catalog/orders/${orderId}/payments/${paymentId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "Payment hat nahi paayi.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network nahi mila. Dobara try karo.");
    } finally {
      setBusy(null);
    }
  }

  const quick = [
    { label: "Pura", paise: balancePaise },
    { label: "Aadha", paise: splitHalf(balancePaise).first },
    { label: "₹100", paise: 10_000 },
    { label: "₹500", paise: 50_000 },
  ].filter((q, i) => (i < 2 ? balancePaise > 0 : q.paise < balancePaise));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink-2">Baaki dena hai</p>
          <p className="font-display text-3xl font-semibold text-ink tnum">₹{paiseToRupees(balancePaise)}</p>
        </div>

        <div className="mt-3 rounded-card border-2 border-brand/30 bg-brand-tint/40 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-2">Ab le rahe ho</span>
            <span className="font-display text-2xl font-semibold text-brand tnum">
              ₹{typed === "" ? paiseToRupees(balancePaise) : paiseToRupees(payPaise)}
              {typed === "" ? <span className="ml-1 text-xs font-normal text-ink-3">(pura)</span> : null}
            </span>
          </div>
          {isPartial ? (
            <p className="mt-1 text-sm font-medium text-warn tnum">
              Iske baad ₹{paiseToRupees(leftoverPaise)} baaki rahega — doosre tarike se lo
            </p>
          ) : null}
          {isOverpay ? (
            <p className="mt-1 text-sm font-medium text-good tnum">Wapsi dena hoga ₹{paiseToRupees(-leftoverPaise)}</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setError(null);
                setTyped(paiseToRupees(q.paise));
              }}
              className="min-h-11 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand active:scale-95"
            >
              {q.label}
            </button>
          ))}
          {typed !== "" ? (
            <button
              type="button"
              onClick={() => setTyped("")}
              className="min-h-11 rounded-control px-3 text-sm font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              Mitao
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              aria-label={k === "del" ? "Ek ank mitao" : k}
              className="min-h-14 rounded-control border border-line bg-surface font-display text-xl font-semibold text-ink transition hover:bg-surface-2 active:scale-95"
            >
              {k === "del" ? "⌫" : k}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => pay(m.value)}
              disabled={busy !== null}
              className="min-h-[88px] rounded-card border-2 border-line bg-surface px-3 py-4 text-center text-base font-semibold text-ink shadow-sm transition hover:border-brand hover:bg-brand-tint/40 active:scale-95 disabled:opacity-50"
            >
              <span className="block text-2xl">{busy === m.value ? "…" : m.icon}</span>
              <span className="mt-1 block">{m.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowReference((v) => !v)}
          className="mt-3 min-h-11 text-sm font-medium text-ink-2 hover:text-ink"
        >
          {showReference ? "− Reference number hatao" : "+ Reference number (UPI / card)"}
        </button>

        {showReference ? (
          <div className="mt-2">
            <label className="block text-xs font-medium text-ink-2" htmlFor="payment-reference">
              Reference
            </label>
            <input
              id="payment-reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="UPI txn / last 4 digits"
              className="mt-1 min-h-11 w-full max-w-xs rounded-control border border-line bg-surface px-3 text-sm text-ink"
            />
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm font-medium text-bad">{error}</p> : null}
      </div>

      <div className="rounded-card border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold text-ink">Ab tak liya</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-3">Kuch nahi liya abhi.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink tnum">₹{p.amount}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {METHOD_LABEL[p.method] ?? p.method}
                    {p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => undo(p.id)}
                  disabled={busy !== null}
                  aria-label={`₹${p.amount} ki payment hatao`}
                  className="shrink-0 rounded-control px-2 py-2 text-base font-semibold text-ink-3 transition hover:bg-bad/10 hover:text-bad disabled:opacity-50"
                >
                  {busy === `undo:${p.id}` ? "…" : "✕"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
          Aadha cash aadha UPI lena ho to: amount type karo → Cash dabao → phir bacha hua amount apne aap aa jaayega →
          UPI dabao.
        </p>
      </div>
    </div>
  );
}
