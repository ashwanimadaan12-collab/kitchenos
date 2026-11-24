"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Select } from "@kitchenos/ui";
import {
  enqueueOrder,
  getReference,
  listQueuedOrders,
  listReferences,
  markQueuedOrderFailed,
  removeQueuedOrder,
  saveReference,
  type OfflineQueuedItem,
  type OfflineQueuedOrder,
  type OfflineReference,
} from "@/lib/offline-pos-db";

const CHANNEL_OPTIONS = [
  { value: "DINE_IN", label: "Dine-in" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "TAKEAWAY", label: "Takeaway" },
];

interface Outlet {
  id: string;
  name: string;
  brandId: string;
}

interface CartLine extends OfflineQueuedItem {
  estimatedTaxRatePercent: string;
}

/**
 * The offline-capable half of the POS: a single page, fully client-driven, that builds and
 * "sells" an order purely from locally cached reference data and queues it in IndexedDB when
 * there's no connection — see the README's "Installable app (PWA) & offline shell" section for
 * why this is deliberately narrower than the full online POS (cash only, no combos/promotions/
 * loyalty/customer). The service worker precaches this page's shell so it still loads with zero
 * connectivity, as long as the cashier has opened it at least once while online.
 */
export function OfflinePosClient() {
  const [isOnline, setIsOnline] = useState(true);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [channel, setChannel] = useState<"DINE_IN" | "DELIVERY" | "TAKEAWAY">("DINE_IN");
  const [reference, setReference] = useState<OfflineReference | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cashTendered, setCashTendered] = useState("");
  const [queued, setQueued] = useState<OfflineQueuedOrder[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const flushing = useRef(false);

  const refreshQueued = useCallback(async () => {
    setQueued(await listQueuedOrders());
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    setIsSyncing(true);
    try {
      const pending = (await listQueuedOrders()).filter((o) => o.status === "pending" || o.status === "failed");
      for (const order of pending) {
        try {
          const res = await fetch("/api/catalog/orders/sync-offline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientOrderId: order.clientOrderId,
              outletId: order.outletId,
              channel: order.channel,
              items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
              cashTendered: order.cashTendered,
            }),
          });
          if (res.ok) {
            await removeQueuedOrder(order.clientOrderId);
          } else {
            const body = (await res.json().catch(() => ({ message: "Sync failed." }))) as { message?: string };
            await markQueuedOrderFailed(order.clientOrderId, body.message ?? "Sync failed.");
          }
        } catch {
          // A real network failure (not a server rejection) — stop here and retry everything on
          // the next online event rather than marking still-queued orders as failed.
          break;
        }
      }
    } finally {
      flushing.current = false;
      setIsSyncing(false);
      await refreshQueued();
    }
  }, [refreshQueued]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => {
      setIsOnline(true);
      flushQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue]);

  useEffect(() => {
    refreshQueued();
    flushQueue();

    (async () => {
      try {
        const res = await fetch("/api/catalog/outlets");
        if (!res.ok) throw new Error("offline");
        const data: Outlet[] = await res.json();
        setOutlets(data);
      } catch {
        const cached = await listReferences();
        setOutlets(cached.map((r) => ({ id: r.outletId, name: r.outletName, brandId: "" })));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!outletId) {
      setReference(null);
      return;
    }
    const outlet = outlets.find((o) => o.id === outletId);
    (async () => {
      try {
        if (!outlet || !navigator.onLine) throw new Error("offline");
        const [productsRes, menusRes] = await Promise.all([
          fetch(`/api/catalog/products?brandId=${outlet.brandId}`),
          fetch(`/api/catalog/menus?brandId=${outlet.brandId}`),
        ]);
        if (!productsRes.ok || !menusRes.ok) throw new Error("offline");
        const products = await productsRes.json();
        const menus = await menusRes.json();

        const activeMenus = (menus as { isActive: boolean; outletMenus: { outlet: { id: string }; isActive: boolean }[]; items: { isAvailable: boolean; variant: { id: string } }[] }[]).filter(
          (m) => m.isActive && m.outletMenus.some((om) => om.outlet.id === outletId && om.isActive),
        );
        const sellableVariantIds = new Set(
          activeMenus.flatMap((m) => m.items).filter((i) => i.isAvailable).map((i) => i.variant.id),
        );

        const items = (products as { taxCategory: { ratePercent: string } | null; name: string; variants: { id: string; name: string; basePrice: string }[] }[])
          .flatMap((p) =>
            p.variants
              .filter((v) => sellableVariantIds.has(v.id))
              .map((v) => ({
                variantId: v.id,
                productName: p.name,
                variantName: v.name,
                estimatedPrice: v.basePrice,
                estimatedTaxRatePercent: p.taxCategory?.ratePercent ?? "0",
              })),
          );

        const freshReference: OfflineReference = {
          outletId,
          outletName: outlet.name,
          fetchedAt: new Date().toISOString(),
          items,
        };
        await saveReference(freshReference);
        setReference(freshReference);
      } catch {
        setReference((await getReference(outletId)) ?? null);
      }
    })();
  }, [outletId, outlets]);

  function addToCart(item: NonNullable<OfflineReference>["items"][number]) {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) {
        return prev.map((l) => (l.variantId === item.variantId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { ...item, quantity: 1, estimatedTaxRatePercent: item.estimatedTaxRatePercent }];
    });
  }

  function updateQuantity(variantId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.variantId !== variantId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  }

  const estimatedTotal = cart.reduce((sum, line) => {
    const lineTotal = Number(line.estimatedPrice) * line.quantity;
    return sum + lineTotal * (1 + Number(line.estimatedTaxRatePercent) / 100);
  }, 0);

  async function completeSale() {
    if (!outletId || !reference || cart.length === 0) return;
    setMessage(null);
    const clientOrderId = crypto.randomUUID();
    const tendered = cashTendered || estimatedTotal.toFixed(2);
    const order: OfflineQueuedOrder = {
      clientOrderId,
      outletId,
      outletName: reference.outletName,
      channel,
      items: cart.map(({ variantId, productName, variantName, quantity, estimatedPrice }) => ({
        variantId,
        productName,
        variantName,
        quantity,
        estimatedPrice,
      })),
      cashTendered: tendered,
      estimatedTotal: estimatedTotal.toFixed(2),
      createdAtOffline: new Date().toISOString(),
      status: "pending",
    };

    if (navigator.onLine) {
      try {
        const res = await fetch("/api/catalog/orders/sync-offline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientOrderId,
            outletId,
            channel,
            items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            cashTendered: tendered,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setMessage(`Sale completed — order #${saved.orderNumber}, total ₹${saved.total}.`);
          setCart([]);
          setCashTendered("");
          return;
        }
      } catch {
        // Fall through to queueing below — a thrown fetch means the network genuinely isn't there.
      }
    }

    await enqueueOrder(order);
    await refreshQueued();
    setCart([]);
    setCashTendered("");
    setMessage(`Saved offline — ₹${order.estimatedTotal} (estimated). Will sync automatically once back online.`);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Offline sale</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${isOnline ? "bg-good-tint text-good" : "bg-warn-tint text-warn"}`}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        Cash-only sales for a single order at a time — no combos, promotions, loyalty redemption or customer
        lookup, since those need live data this screen can&apos;t trust while offline. Prices shown are estimates;
        the real total is calculated when the sale syncs.
      </p>

      {queued.length > 0 ? (
        <div className="mt-4 rounded-lg border border-warn-line bg-warn-tint p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-warn">
              {queued.filter((q) => q.status === "pending").length} queued,{" "}
              {queued.filter((q) => q.status === "failed").length} failed
            </p>
            <Button variant="secondary" isLoading={isSyncing} onClick={flushQueue} disabled={!isOnline}>
              Sync now
            </Button>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-warn">
            {queued.map((q) => (
              <li key={q.clientOrderId}>
                {q.outletName} — ₹{q.estimatedTotal} ({q.items.length} item{q.items.length === 1 ? "" : "s"})
                {q.status === "failed" ? ` — ${q.lastError}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink">{message}</p> : null}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <Select
          aria-label="Outlet"
          value={outletId}
          onChange={(e) => {
            setOutletId(e.target.value);
            setCart([]);
          }}
          options={outlets.map((o) => ({ value: o.id, label: o.name }))}
          placeholder="Select an outlet"
        />
        <Select aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} options={CHANNEL_OPTIONS} />
      </div>

      {outletId && !reference ? (
        <p className="mt-4 text-sm text-ink-3">
          No menu cached for this outlet yet — open this screen once while online to set up offline sales here.
        </p>
      ) : null}

      {reference ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section>
            <h2 className="text-sm font-semibold text-ink">Menu</h2>
            <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-line bg-surface">
              {reference.items.map((item) => (
                <button
                  key={item.variantId}
                  type="button"
                  onClick={() => addToCart(item)}
                  className="flex w-full items-center justify-between border-b border-line px-4 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                >
                  <span className="font-medium text-ink">
                    {item.productName} — {item.variantName}
                  </span>
                  <span className="text-ink-2">₹{item.estimatedPrice}</span>
                </button>
              ))}
              {reference.items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-3">No sellable items cached for this outlet.</p>
              ) : null}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Cart</h2>
            <div className="mt-2 rounded-lg border border-line bg-surface">
              {cart.map((line) => (
                <div key={line.variantId} className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm last:border-0">
                  <span className="font-medium text-ink">
                    {line.productName} ({line.variantName})
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.variantId, Number(e.target.value))}
                      className="w-16 rounded-md border border-line px-2 py-1 text-sm"
                    />
                    <span className="text-ink-2">₹{(Number(line.estimatedPrice) * line.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {cart.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-3">No items added yet.</p> : null}
            </div>

            <div className="mt-3 flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-2" htmlFor="cash-tendered">
                  Cash tendered
                </label>
                <input
                  id="cash-tendered"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={estimatedTotal.toFixed(2)}
                  className="mt-1 w-32 rounded-md border border-line px-3 py-1.5 text-sm"
                />
              </div>
              <p className="pb-2 text-sm text-ink-2">Estimated total: ₹{estimatedTotal.toFixed(2)}</p>
            </div>

            <Button className="mt-3" disabled={cart.length === 0} onClick={completeSale}>
              Complete sale (cash)
            </Button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
