"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface AddItemFormProps {
  orderId: string;
  availableVariants: { id: string; label: string; category: string }[];
  /** Existing non-combo active lines, so tapping an item already on the order bumps its qty by 1 instead of adding a duplicate row. */
  activeItems: { id: string; variantId: string; quantity: number }[];
}

const ALL = "Sabhi";

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
        setError(body.message ?? "Item add nahi ho paaya.");
        return;
      }
      router.refresh();
    } finally {
      setLoadingVariantId(null);
    }
  }

  if (availableVariants.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Is outlet par koi menu item nahi hai abhi. Pehle Quick Setup ya Menu se item add karo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {categories.length > 2 ? (
        <div className="flex gap-2 overflow-x-auto sm:w-40 sm:flex-shrink-0 sm:flex-col sm:overflow-visible">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${
                activeCategory === category
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Item search karo..."
          className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visibleVariants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => onTap(variant.id)}
              disabled={loadingVariantId === variant.id}
              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-6 text-center text-base font-semibold text-slate-900 shadow-sm transition hover:border-slate-900 hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            >
              {loadingVariantId === variant.id ? "…" : variant.label}
            </button>
          ))}
          {visibleVariants.length === 0 ? (
            <p className="col-span-full text-sm text-slate-400">Koi item nahi mila.</p>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
