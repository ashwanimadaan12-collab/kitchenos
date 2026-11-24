import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AdvanceTicketButton } from "./advance-ticket-button";
import { LiveRefresh } from "./live-refresh";

interface Ticket {
  id: string;
  status: "QUEUED" | "IN_PROGRESS" | "READY";
  queuedAt: string;
  orderItem: {
    quantity: number;
    productName: string;
    variantName: string;
    order: { orderNumber: number; channel: string; outlet: { name: string } };
  };
}

const COLUMNS: { status: Ticket["status"]; title: string }[] = [
  { status: "QUEUED", title: "Queued" },
  { status: "IN_PROGRESS", title: "In progress" },
  { status: "READY", title: "Ready" },
];

const NEXT_STATUS: Record<Ticket["status"], { status: "IN_PROGRESS" | "READY" | "SERVED"; label: string }> = {
  QUEUED: { status: "IN_PROGRESS", label: "Start" },
  IN_PROGRESS: { status: "READY", label: "Mark ready" },
  READY: { status: "SERVED", label: "Mark served" },
};

export default async function KdsStationBoardPage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params;
  const res = await apiFetch(`/v1/kds/stations/${stationId}/tickets`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load tickets");
  const tickets: Ticket[] = await res.json();

  return (
    <div>
      <LiveRefresh stationId={stationId} />
      <h1 className="text-2xl font-semibold text-ink">Kitchen Display</h1>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnTickets = tickets.filter((t) => t.status === column.status);
          return (
            <div key={column.status}>
              <h2 className="text-sm font-semibold text-ink">
                {column.title} ({columnTickets.length})
              </h2>
              <div className="mt-2 space-y-3">
                {columnTickets.map((ticket) => {
                  const next = NEXT_STATUS[ticket.status];
                  return (
                    <div key={ticket.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
                      <p className="font-medium text-ink">
                        {ticket.orderItem.productName} — {ticket.orderItem.variantName}
                      </p>
                      <p className="text-ink-2">Qty {ticket.orderItem.quantity}</p>
                      <p className="mt-1 text-xs text-ink-3">
                        #{ticket.orderItem.order.orderNumber} · {ticket.orderItem.order.outlet.name} ·{" "}
                        {ticket.orderItem.order.channel}
                      </p>
                      <p className="text-xs text-ink-3">
                        Queued {new Date(ticket.queuedAt).toLocaleTimeString()}
                      </p>
                      <div className="mt-2">
                        <AdvanceTicketButton ticketId={ticket.id} nextStatus={next.status} label={next.label} />
                      </div>
                    </div>
                  );
                })}
                {columnTickets.length === 0 ? <p className="text-sm text-ink-3">Nothing here.</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
