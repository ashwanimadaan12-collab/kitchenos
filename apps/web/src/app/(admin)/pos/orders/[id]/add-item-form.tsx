"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, ChipGroup, Icon, Input } from "@kitchenos/ui";

interface AddItemFormProps {
  orderId: string;
  availableVariants: { id: string; label: string; category: string; price: string }[];
  /** Existing non-combo active lines, so tapping an item already on the order bumps its qty by 1 instead of adding a duplicate row. */
  activeItems: { id: string; variantId: string; quantity: number }[];
}

const ALL = "Sabhi";

function rupees(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function AddItemForm({ orderId, availableVariants, activeItems }: AddItemFormProps) {
  const router = useRouter();
  const [loadingVariantId, setLoadingVariantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(ALL);
  const [search, setSearch] = useState("");

  const categories = useMemo(() => {
    const unique = Array.from(new Set(availableVariants.map((v) => v.category)));
    return [ALL, ...unique];
  }, [availableVariants]);

  const qtyByVariantId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of activeItems) {
      map.set(item.variantId, (map.get(item.variantId) ?? 0) + item.quantity);
    }
    return map;
  }, [activeItems]);

  const visibleVariants = availableVariants.filter((v) => {
    const matchesCategory = activeCategory === ALL || v.category === activeCategory;
    const matchesSearch = v.label.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  async function onTap(variantId: string) {
    setError(null);
    setLoadingVariantId(variantId);
    try {
      const existing = activeItems.find((item) => item.variantId === variantId);
      const res = existing
        ? await fetch(`/api/catalog/orders/${orderId}/items/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity: existing.quantity + 1 }),
          })
        : await fetch(`/api/catalog/orders/${orderId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ variantId, quantity: 1 }),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Item add nahi ho paaya." }))) as {
          message?: string;
        };
        setError(body.message ?? "Item add nahi ho paaya. Dobara tap karo.");
        return;
      }
      router.refresh();
    } finally {
      setLoadingVariantId(null);
    }
  }

  if (availableVariants.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        Is outlet par koi menu item nahi hai abhi. Pehle Quick Setup ya Menu se item add karo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">
          <Icon name="search" size={18} />
        </span>
        <label htmlFor="pos-search" className="sr-only">
          Item dhoondho
        </label>
        <Input
          id="pos-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Item ka naam likho"
          className="pl-11"
        />
      </div>

      {categories.length > 2 ? (
        <ChipGroup label="Category">
          {categories.map((category) => (
            <Chip
              key={category}
              selected={activeCategory === category}
              onSelect={() => setActiveCategory(category)}
            >
              {category}
            </Chip>
          ))}
        </ChipGroup>
      ) : null}

      {/* One tap adds the item. Tapping again bumps its quantity, so there is no
          popup and no separate "add to order" step. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visibleVariants.map((variant) => {
          const qty = qtyByVariantId.get(variant.id) ?? 0;
          const isLoading = loadingVariantId === variant.id;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onTap(variant.id)}
              disabled={isLoading}
              aria-label={`${variant.label}, ${rupees(variant.price)}${qty ? `, ${qty} order me hai` : ""}`}
              className={`flex min-h-[7.5rem] flex-col items-start gap-2 rounded-card p-4 text-left transition-colors disabled:opacity-60 ${
                qty > 0
                  ? "border-2 border-brand bg-brand-tint"
                  : "border border-line bg-surface hover:border-brand"
              }`}
            >
              <span className="text-[15px] font-bold leading-tight text-ink">{variant.label}</span>
              <span className="mt-auto flex w-full items-baseline justify-between">
                <span className="tnum font-display text-lg font-bold text-ink">{rupees(variant.price)}</span>
                <span className={`text-xs font-bold ${qty > 0 ? "text-brand-tint-ink" : "text-ink-3"}`}>
                  {isLoading ? "…" : qty > 0 ? `${qty} added` : "Tap karo"}
                </span>
              </span>
            </button>
          );
        })}
        {visibleVariants.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-ink-3">Koi item nahi mila.</p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
