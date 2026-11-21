"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface ItemRow {
  name: string;
  price: string;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60);
  return slug || `brand-${Date.now()}`;
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

export function QuickSetupWizard() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { name: "", price: "" },
    { name: "", price: "" },
    { name: "", price: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { name: "", price: "" }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((item) => item.name.trim() && item.price.trim());
    if (!restaurantName.trim()) {
      setError("Restaurant ka naam daalo.");
      return;
    }
    if (validItems.length === 0) {
      setError("Kam se kam ek menu item (naam + price) daalo.");
      return;
    }

    setIsSubmitting(true);
    try {
      setProgress("Restaurant bana rahe hain...");
      const slug = slugify(restaurantName);
      const brand = await call<{ id: string }>("/brands", "POST", {
        name: restaurantName,
        slug,
      });

      setProgress("Kitchen set up kar rahe hain...");
      const kitchen = await call<{ id: string }>("/kitchens", "POST", {
        name: `${restaurantName} Kitchen`,
        code: codify(`${slug}-k`, 30),
      });
      await call("/kitchens/" + kitchen.id + "/brands", "POST", { brandId: brand.id, isPrimary: true });

      setProgress("Branch/outlet bana rahe hain...");
      const outlet = await call<{ id: string }>("/outlets", "POST", {
        brandId: brand.id,
        name: restaurantName,
        code: codify(slug, 30),
        address: address || undefined,
        city: city || undefined,
      });
      await call("/outlets/" + outlet.id + "/kitchens", "POST", { kitchenId: kitchen.id, isPrimary: true });

      setProgress("Tax aur category set kar rahe hain...");
      const taxCategory = await call<{ id: string }>("/tax-categories", "POST", {
        name: "No Tax",
        ratePercent: "0.00",
      });
      const category = await call<{ id: string }>("/product-categories", "POST", {
        brandId: brand.id,
        name: "General",
      });

      setProgress("Menu bana rahe hain...");
      const menu = await call<{ id: string }>("/menus", "POST", {
        brandId: brand.id,
        name: "Main Menu",
      });
      await call("/menus/" + menu.id + "/outlets", "POST", { outletId: outlet.id, channel: "ALL" });

      for (let i = 0; i < validItems.length; i += 1) {
        const item = validItems[i];
        if (!item) continue;
        setProgress(`Menu item add kar rahe hain (${i + 1}/${validItems.length}): ${item.name}`);
        const baseCode = codify(`${slug}-${item.name}-${i}`, 36);
        const product = await call<{ variants: { id: string }[] }>("/products", "POST", {
          brandId: brand.id,
          categoryId: category.id,
          taxCategoryId: taxCategory.id,
          name: item.name,
          sku: baseCode,
          variants: [{ name: "Regular", sku: `${baseCode}-R`, basePrice: item.price }],
        });
        const variantId = product.variants[0]?.id;
        if (!variantId) continue;
        await call("/menus/" + menu.id + "/items", "POST", { variantId });
        await call(`/pricing/outlets/${outlet.id}/variants/${variantId}`, "PUT", { price: item.price });
      }

      setProgress("Taiyaar hai! Order screen khol rahe hain...");
      router.push("/pos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya, dobara try karo.");
      setProgress("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700" htmlFor="restaurant-name">
          Restaurant ka naam
        </label>
        <input
          id="restaurant-name"
          required
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          placeholder="Malai Raja"
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="address">
              Address (optional)
            </label>
            <input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="city">
              City (optional)
            </label>
            <input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Menu items (naam + price)</p>
        <div className="mt-3 space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                placeholder="Item ka naam, jaise Butter Chicken"
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Price"
                inputMode="decimal"
                value={item.price}
                onChange={(e) => updateItem(index, "price", e.target.value)}
                className="w-28 rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeItemRow(index)}
                className="rounded-md px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                aria-label="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItemRow}
          className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          + Aur item add karo
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {progress && !error ? <p className="text-sm text-slate-600">{progress}</p> : null}

      <Button type="submit" isLoading={isSubmitting} className="w-full justify-center py-3 text-base">
        Restaurant live karo
      </Button>
    </form>
  );
}
