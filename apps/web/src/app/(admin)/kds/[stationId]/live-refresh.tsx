"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { API_URL } from "@/lib/constants";

/**
 * Keeps the station board current without a manual refresh: joins this station's room on the
 * `/kds` namespace and re-runs the Server Component's own data fetch (router.refresh()) whenever
 * a ticket changes, rather than maintaining a second, client-side copy of ticket state — the
 * same "server component is the source of truth, refresh it on demand" pattern
 * AdvanceTicketButton already uses for its own action.
 */
export function LiveRefresh({ stationId }: { stationId: string }) {
  const router = useRouter();

  useEffect(() => {
    let socket: ReturnType<typeof io> | undefined;
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/ws-token");
      if (!res.ok || cancelled) return;
      const { token, organizationId } = await res.json();
      if (cancelled) return;

      socket = io(`${API_URL}/kds`, { auth: { token, organizationId }, transports: ["websocket"] });
      // Wait for the server's "ready" handshake (sent once its own async auth check finishes)
      // before joining a room — joining straight off "connect" can race ahead of it and silently
      // join nothing. See kds.gateway.ts's handleConnection for the other half of this.
      socket.on("ready", () => socket?.emit("station:join", stationId));
      socket.on("ticket.created", () => router.refresh());
      socket.on("ticket.updated", () => router.refresh());
      socket.on("ticket.cancelled", () => router.refresh());
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [stationId, router]);

  return null;
}
