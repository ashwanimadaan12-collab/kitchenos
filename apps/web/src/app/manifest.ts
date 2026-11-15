import type { MetadataRoute } from "next";

/**
 * Served by Next.js at /manifest.webmanifest and auto-linked into <head> — this is what lets a
 * browser treat KitchenOS as an installable app (home-screen icon on mobile/tablet, its own
 * window on desktop/laptop) instead of just a bookmarked tab. The icons it points at (/icon,
 * /apple-icon) are generated on demand by Next's `icon.tsx`/`apple-icon.tsx`, not static files.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KitchenOS",
    short_name: "KitchenOS",
    description: "Enterprise multi-brand restaurant ERP & POS",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    orientation: "any",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
