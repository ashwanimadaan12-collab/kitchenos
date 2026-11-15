// Hand-written (no Workbox/next-pwa dependency, to stay clear of their Next-15/App-Router/
// Turbopack compatibility gaps). Scope is deliberately narrow: cache the app SHELL (pages,
// JS/CSS, fonts) for fast repeat loads and a usable "you're offline" screen when navigation
// fails — it never touches API calls. Order-taking while offline is a separate, harder problem
// (data integrity, sync) handled by the POS page's own IndexedDB queue, not by this cache.
const CACHE_NAME = "kitchenos-shell-v2";
const OFFLINE_URL = "/offline";
// This page's content is entirely client/IndexedDB-driven (see offline-pos-client.tsx) — never
// server-rendered business data — so serving a cached copy of it is never "stale" the way
// serving a cached /dashboard or /reports would be. Every other page keeps the generic
// network-or-offline-fallback behavior below.
const OFFLINE_POS_URL = "/pos/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", OFFLINE_URL, OFFLINE_POS_URL])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept POST/PUT/DELETE — those are real mutations, not cacheable.

  const url = new URL(request.url);
  // Data calls always go straight to the network, untouched — serving a stale cached API
  // response would silently show wrong revenue/stock/order numbers, which is worse than an
  // honest network error.
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    if (url.pathname === OFFLINE_POS_URL) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            return response;
          })
          .catch(() => caches.match(request).then((cached) => cached ?? caches.match(OFFLINE_URL))),
      );
      return;
    }
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Stale-while-revalidate for static assets: instant repeat loads, refreshed in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
