import { OfflinePosClient } from "./offline-pos-client";

/**
 * Deliberately no server-side data fetching here — everything this page needs is fetched and
 * cached by the client component itself (see offline-pos-client.tsx and lib/offline-pos-db.ts).
 * That matters for offline support: the service worker precaches this page's shell (sw.js), and
 * a cached server-rendered page must never embed a stale snapshot of business data — rendering
 * nothing but the client component here means the cached HTML is just a shell, never a snapshot.
 */
export default function OfflinePosPage() {
  return <OfflinePosClient />;
}
