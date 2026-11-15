"use client";

import { useEffect } from "react";

/** Mounted once in the root layout so every route — login included — gets the offline shell cache. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort: a failed registration (unsupported browser, blocked by the user) should
        // never break the page — it just means no install prompt / offline shell this session.
      });
    }
  }, []);
  return null;
}
