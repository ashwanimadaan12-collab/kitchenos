import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { TrackBoard, type BoardOrder, type BoardRider } from "./track-board";

/** The board polls, so a cached first paint would show stale columns for 15 seconds. */
export const dynamic = "force-dynamic";

export default async function TrackPage() {
  const [ordersRes, ridersRes] = await Promise.all([apiFetch("/v1/orders/in-flight"), apiFetch("/v1/riders")]);
  const orders: BoardOrder[] = ordersRes.ok ? await ordersRes.json() : [];
  const riders: BoardRider[] = ridersRes.ok ? await ridersRes.json() : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">Order kahan pahuncha</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Har order ka button dabao jaise-jaise wo aage badhe. Kitchen screen lagi ho to{" "}
            <span className="font-semibold text-ink">Ban raha hai</span> aur{" "}
            <span className="font-semibold text-ink">Ready</span> apne aap ho jaata hai. List har 15 second mein khud
            refresh hoti hai.
          </p>
        </div>
        <Link
          href="/riders"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong px-4 text-sm font-bold text-ink no-underline"
        >
          Delivery boys
        </Link>
      </header>

      <TrackBoard initialOrders={orders} riders={riders} />
    </div>
  );
}
