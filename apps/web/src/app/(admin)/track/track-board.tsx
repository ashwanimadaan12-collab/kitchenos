"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Icon } from "@kitchenos/ui";
import {
  CHANNEL_LABEL,
  fulfillmentAction,
  fulfillmentLabel,
  nextStage,
  type FulfillmentStage,
  type OrderChannel,
} from "@kitchenos/shared";

export interface BoardOrder {
  id: string;
  orderNumber: number;
  channel: OrderChannel;
  status: "OPEN" | "PAID" | "VOIDED";
  fulfillment: FulfillmentStage;
  total: string;
  createdAt: string;
  readyAt: string | null;
  outlet: { id: string; name: string };
  table: { id: string; name: string } | null;
  customer: { id: string; name: string; phone?: string | null } | null;
  rider: { id: string; name: string; phone: string | null } | null;
  payments: { id: string; amount: string }[];
}

export interface BoardRider {
  id: string;
  outletId: string;
  name: string;
  phone: string | null;
}

/** The board's columns. PICKED_UP holds delivery orders only — see stageAppliesTo. */
const COLUMNS: { stage: FulfillmentStage; title: string; hint: string }[] = [
  { stage: "PLACED", title: "Naya", hint: "Kitchen ko gaya" },
  { stage: "COOKING", title: "Ban raha hai", hint: "Chulhe par" },
  { stage: "READY", title: "Ready", hint: "Dene ke liye taiyaar" },
  { stage: "PICKED_UP", title: "Raste mein", hint: "Rider nikal gaya" },
  { stage: "COMPLETED", title: "Ho gaya", hint: "Pichhle 30 min" },
];

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

/** A ticket's age is the one number a cashier reads first, so it is coloured, not just printed. */
function ageTone(minutes: number): string {
  if (minutes >= 20) return "bg-bad/10 text-bad";
  if (minutes >= 10) return "bg-warn/10 text-warn";
  return "bg-good/10 text-good";
}

function balanceDue(order: BoardOrder): number {
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(Number(order.total) - paid, 0);
}

export function TrackBoard({ initialOrders, riders }: { initialOrders: BoardOrder[]; riders: BoardRider[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riderFor, setRiderFor] = useState<BoardOrder | null>(null);
  // Re-renders once a minute so the age chips keep counting up between polls.
  const [, setTick] = useState(0);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/catalog/orders/in-flight", {
        cache: "no-store",
      });
      if (res.ok) setOrders((await res.json()) as BoardOrder[]);
    } catch {
      // A dropped poll on a 4G tablet is normal; the next one in 15s picks it up.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const poll = setInterval(refresh, 15_000);
    const clock = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  async function advance(order: BoardOrder, stage: FulfillmentStage, riderId?: string) {
    setError(null);
    setBusyId(order.id);
    // Optimistic: the cashier is holding a hot parcel and should not wait for a round trip.
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, fulfillment: stage } : o)));
    try {
      const res = await fetch(`/api/catalog/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, riderId: riderId ?? null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "Update nahi ho paaya.");
      }
    } catch {
      setError("Network nahi mila. Dobara try karo.");
    } finally {
      setBusyId(null);
      setRiderFor(null);
      await refresh();
    }
  }

  function onNext(order: BoardOrder) {
    const next = nextStage(order.fulfillment, order.channel);
    if (!next) return;
    if (next === "PICKED_UP") {
      setRiderFor(order);
      return;
    }
    void advance(order, next);
  }

  const visibleColumns = COLUMNS.filter((c) => c.stage !== "PICKED_UP" || orders.some((o) => o.channel === "DELIVERY"));

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-control border border-bad/40 bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{error}</p>
      ) : null}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {visibleColumns.map((col) => {
          const inColumn = orders.filter((o) => o.fulfillment === col.stage);
          return (
            <section key={col.stage} className="flex w-[280px] shrink-0 flex-col gap-3">
              <header className="flex items-baseline justify-between gap-2 border-b-2 border-line pb-2">
                <div>
                  <h2 className="font-display text-base font-bold text-ink">{col.title}</h2>
                  <p className="text-xs text-ink-3">{col.hint}</p>
                </div>
                <span className="font-display text-xl font-bold text-ink-2 tnum">{inColumn.length}</span>
              </header>

              {inColumn.length === 0 ? (
                <p className="rounded-card border border-dashed border-line px-3 py-6 text-center text-sm text-ink-3">
                  Khaali
                </p>
              ) : null}

              {inColumn.map((order) => {
                const next = nextStage(order.fulfillment, order.channel);
                const due = balanceDue(order);
                const minutes = minutesSince(order.createdAt);
                // Once it is ready, cold food is the risk, so the chip switches to the wait.
                const waiting = order.fulfillment === "READY" && order.readyAt ? minutesSince(order.readyAt) : null;
                return (
                  <article key={order.id} className="rounded-card border border-line bg-surface p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold text-ink">#{order.orderNumber}</p>
                        <p className="truncate text-xs text-ink-2">
                          {CHANNEL_LABEL[order.channel]}
                          {order.table ? ` · ${order.table.name}` : ""}
                          {order.customer ? ` · ${order.customer.name}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tnum ${ageTone(
                          waiting ?? minutes,
                        )}`}
                        title={
                          waiting === null
                            ? "Order punch hone se ab tak"
                            : "Ready hone se ab tak — itni der se rakha hai"
                        }
                      >
                        {waiting === null ? `${minutes}m` : `${waiting}m rakha`}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink tnum">₹{Math.round(Number(order.total))}</span>
                      {due > 0.009 ? (
                        <Badge tone="warn">₹{Math.round(due)} baaki</Badge>
                      ) : (
                        <Badge tone="good">Paid</Badge>
                      )}
                    </div>

                    {order.rider ? (
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-ink-2">
                        <Icon name="rider" size={14} />
                        {order.rider.name}
                        {order.rider.phone ? ` · ${order.rider.phone}` : ""}
                      </p>
                    ) : null}

                    {next ? (
                      <button
                        type="button"
                        onClick={() => onNext(order)}
                        disabled={busyId === order.id}
                        className="mt-3 min-h-12 w-full rounded-control bg-brand px-3 text-sm font-bold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                      >
                        {busyId === order.id ? "…" : fulfillmentAction(next, order.channel)}
                      </button>
                    ) : (
                      <p className="mt-3 text-center text-xs font-semibold text-good">
                        {fulfillmentLabel(order.fulfillment, order.channel)}
                      </p>
                    )}

                    {order.channel === "DELIVERY" && order.fulfillment === "READY" ? (
                      <button
                        type="button"
                        onClick={() => void advance(order, "COMPLETED")}
                        disabled={busyId === order.id}
                        className="mt-2 min-h-11 w-full rounded-control border border-line text-xs font-semibold text-ink-2 transition hover:text-ink disabled:opacity-50"
                      >
                        Customer khud le gaya
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {riderFor ? (
        <RiderPicker
          order={riderFor}
          riders={riders.filter((r) => r.outletId === riderFor.outlet.id)}
          busy={busyId === riderFor.id}
          onCancel={() => setRiderFor(null)}
          onPick={(riderId) => void advance(riderFor, "PICKED_UP", riderId)}
        />
      ) : null}
    </div>
  );
}

function RiderPicker({
  order,
  riders,
  busy,
  onCancel,
  onPick,
}: {
  order: BoardOrder;
  riders: BoardRider[];
  busy: boolean;
  onCancel: () => void;
  onPick: (riderId: string) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rider chuno"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-lg">
        <h3 className="font-display text-lg font-bold text-ink">#{order.orderNumber} kaun le ja raha hai?</h3>
        {riders.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">
            Is outlet ke liye koi delivery boy add nahi hai. Settings → Delivery boys mein add karo.
          </p>
        ) : (
          <div className="mt-4 grid gap-2">
            {riders.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r.id)}
                disabled={busy}
                className="min-h-14 rounded-control border-2 border-line bg-surface px-4 text-left text-base font-semibold text-ink transition hover:border-brand hover:bg-brand-tint/40 active:scale-95 disabled:opacity-50"
              >
                {r.name}
                {r.phone ? <span className="ml-2 text-sm font-normal text-ink-2">{r.phone}</span> : null}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 min-h-11 w-full rounded-control border border-line text-sm font-semibold text-ink-2"
        >
          Rehne do
        </button>
      </div>
    </div>
  );
}
