"use client";

import { useState } from "react";

interface MenuItem {
  variantId: string;
  productName: string;
  variantName: string;
  price: string;
}

interface CartLine extends MenuItem {
  quantity: number;
}

export function OrderClient({ qrToken, items }: { qrToken: string; items: MenuItem[] }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) return prev.map((l) => (l.variantId === item.variantId ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function updateQuantity(variantId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.variantId !== variantId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  }

  const estimatedTotal = cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);

  async function placeOrder() {
    setStatus("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/catalog/public/tables/${qrToken}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Could not place order." }))) as { message?: string };
        setErrorMessage(body.message ?? "Could not place order.");
        setStatus("error");
        return;
      }
      const order = await res.json();
      setOrderNumber(order.orderNumber);
      setCart([]);
      setStatus("done");
    } catch {
      setErrorMessage("Could not reach the kitchen — check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-lg border border-line bg-good-tint p-6 text-center">
        <p className="text-lg font-semibold text-good">Order #{orderNumber} sent to the kitchen!</p>
        <p className="mt-1 text-sm text-good">A staff member will bring it over. Pay at the counter when you&apos;re ready.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 rounded-md bg-good px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Order more
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4">
        {items.map((item) => (
          <button
            key={item.variantId}
            type="button"
            onClick={() => addToCart(item)}
            className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-left hover:border-brand"
          >
            <span>
              <span className="font-medium text-ink">
                {item.productName} — {item.variantName}
              </span>
            </span>
            <span className="font-medium text-ink">₹{item.price}</span>
          </button>
        ))}
      </div>

      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-4 shadow-lg">
          <div className="mx-auto max-w-lg">
            {cart.map((line) => (
              <div key={line.variantId} className="flex items-center justify-between py-1 text-sm">
                <span>
                  {line.productName} ({line.variantName})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(line.variantId, line.quantity - 1)}
                    className="h-6 w-6 rounded-full bg-surface-2 text-ink"
                  >
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    onClick={() => updateQuantity(line.variantId, line.quantity + 1)}
                    className="h-6 w-6 rounded-full bg-surface-2 text-ink"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <span className="font-semibold text-ink">Total: ₹{estimatedTotal.toFixed(2)}</span>
              <button
                onClick={placeOrder}
                disabled={status === "submitting"}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {status === "submitting" ? "Sending…" : "Send to kitchen"}
              </button>
            </div>
            {errorMessage ? <p className="mt-1 text-sm text-bad">{errorMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
