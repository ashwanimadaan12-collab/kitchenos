"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface KitchenWithStations {
  id: string;
  stations: { id: string; isActive: boolean }[];
  brandKitchens: { brand: { id: string } }[];
}

interface ProductWithVariants {
  brandId: string;
  variants: { id: string }[];
}

interface RecipeRow {
  variantId: string;
}

function codify(value: string, maxLength: number): string {
  const code = value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, maxLength);
  return code || `C${Date.now()}`.slice(0, maxLength);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/catalog${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({ message: undefined }))) as { message?: string };
    throw new Error(data.message ?? `Step failed: ${method} ${path}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Orders only reach a KDS station once their variant has a Recipe pointed at a station — the
 * manual setup path (Kitchen → Add Station, then a Recipe per variant) that Quick Setup and the
 * Excel import skip. This repairs both gaps for existing data: creates a station for any kitchen
 * that doesn't have one, then links every variant that still has no Recipe to its brand's station.
 */
export function FixKitchenRoutingButton() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRun() {
    setIsRunning(true);
    setError(null);
    setMessage(null);
    try {
      const [kitchens, products, recipes] = await Promise.all([
        call<KitchenWithStations[]>("GET", "/kitchens"),
        call<ProductWithVariants[]>("GET", "/products"),
        call<RecipeRow[]>("GET", "/recipes"),
      ]);

      const stationIdByBrandId = new Map<string, string>();
      for (const kitchen of kitchens) {
        let stationId = kitchen.stations.find((s) => s.isActive)?.id;
        if (!stationId) {
          const station = await call<{ id: string }>(`/kitchens/${kitchen.id}/stations`, "POST", {
            name: "Main Station",
            code: codify(`K${kitchen.id.slice(-6)}-ST`, 30),
          });
          stationId = station.id;
        }
        for (const bk of kitchen.brandKitchens) {
          if (!stationIdByBrandId.has(bk.brand.id)) stationIdByBrandId.set(bk.brand.id, stationId);
        }
      }

      const variantsWithRecipe = new Set(recipes.map((r) => r.variantId));
      let linked = 0;
      let skipped = 0;
      for (const product of products) {
        const stationId = stationIdByBrandId.get(product.brandId);
        for (const variant of product.variants) {
          if (variantsWithRecipe.has(variant.id)) continue;
          if (!stationId) {
            skipped += 1;
            continue;
          }
          await call("/recipes", "POST", { variantId: variant.id, preparationStationId: stationId });
          linked += 1;
        }
      }

      setMessage(
        `${linked} menu item${linked === 1 ? "" : "s"} ab kitchen screen se jude hain.` +
          (skipped > 0 ? ` ${skipped} item ka brand kisi kitchen se linked nahi hai — pehle wo map karo.` : ""),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya, dobara try karo.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-warn-line bg-warn-tint p-4">
      <p className="text-sm text-warn">
        Agar order lene ke baad bhi kitchen screen pe kuch nahi dikh raha, niche button dabao — ye sabhi menu item ko
        kitchen se jod dega (ek hi baar karna hoga).
      </p>
      <Button type="button" onClick={onRun} isLoading={isRunning} className="mt-3">
        Kitchen Screen theek karo
      </Button>
      {message ? <p className="mt-2 text-sm text-good">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
    </div>
  );
}
