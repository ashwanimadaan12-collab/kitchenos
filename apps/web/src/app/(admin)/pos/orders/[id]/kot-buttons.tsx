"use client";

import { useEffect, useState } from "react";
import { Button, Icon } from "@kitchenos/ui";

interface KotButtonsProps {
  orderId: string;
  /** Active, non-voided line ids, oldest first. */
  itemIds: string[];
  isOpen: boolean;
}

/**
 * KOT printing in rounds.
 *
 * A table orders, the kitchen gets a ticket, then the table orders two more
 * things. Printing "KOT" again would hand the kitchen a ticket listing the food
 * it already cooked — so this remembers which lines have gone to the kitchen and
 * offers the new ones on their own ticket, with the full reprint kept separate.
 *
 * The record lives in this browser, which is right for a single counter device.
 * When a second printing device or a kitchen screen arrives it should move to a
 * column on OrderItem; the print page already takes explicit ids, so only this
 * component changes.
 */
const KEY_PREFIX = "kitchenos.kot.v1.";

interface Sent {
  ids: string[];
  rounds: number;
}

function read(orderId: string): Sent {
  if (typeof window === "undefined") return { ids: [], rounds: 0 };
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + orderId);
    if (!raw) return { ids: [], rounds: 0 };
    const parsed = JSON.parse(raw) as Partial<Sent>;
    return { ids: Array.isArray(parsed.ids) ? parsed.ids : [], rounds: Number(parsed.rounds) || 0 };
  } catch {
    return { ids: [], rounds: 0 };
  }
}

function write(orderId: string, value: Sent) {
  try {
    window.localStorage.setItem(KEY_PREFIX + orderId, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota: printing still works, the counter just
    // loses the record of which round it is on.
  }
}

export function KotButtons({ orderId, itemIds, isOpen }: KotButtonsProps) {
  const [sent, setSent] = useState<Sent>({ ids: [], rounds: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSent(read(orderId));
    setReady(true);
  }, [orderId]);

  const pending = itemIds.filter((id) => !sent.ids.includes(id));
  const firstRound = sent.rounds === 0;

  function openPrint(url: string) {
    window.open(url, "_blank", "noopener");
  }

  function printPending() {
    const round = sent.rounds + 1;
    // A first ticket is the whole order, so it needs no "new items only" banner.
    const url = firstRound
      ? `/print/kot/${orderId}?round=${round}`
      : `/print/kot/${orderId}?round=${round}&items=${pending.join(",")}`;
    openPrint(url);
    const next = { ids: [...sent.ids, ...pending], rounds: round };
    setSent(next);
    write(orderId, next);
  }

  function printEverything() {
    openPrint(`/print/kot/${orderId}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOpen && ready && pending.length > 0 ? (
        <Button size="sm" onClick={printPending}>
          <Icon name="order" size={16} />
          {firstRound ? "KOT kitchen me bhejo" : `Naye ${pending.length} item ka KOT`}
        </Button>
      ) : null}

      {ready && pending.length === 0 && sent.rounds > 0 ? (
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-good">
          <Icon name="order" size={16} />
          Saare item kitchen ja chuke ({sent.rounds} KOT)
        </span>
      ) : null}

      <Button variant="secondary" size="sm" onClick={printEverything}>
        {sent.rounds > 0 ? "Pura KOT dobara" : "KOT dekho"}
      </Button>

      <a
        href={`/print/receipt/${orderId}`}
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-bold text-ink no-underline"
      >
        Bill print
      </a>
    </div>
  );
}
