"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@kitchenos/ui";

interface ItemRow {
  name: string;
  price: string;
  mrp: string;
  purchasePrice: string;
}

const EMPTY_ROW: ItemRow = { name: "", price: "", mrp: "", purchasePrice: "" };

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

// Matches a sheet column header to one of our fields, tolerant of spelling/spacing
// so a restaurant's own Excel ("Item", "Rate", "Cost Price"...) just works.
const HEADER_ALIASES: Record<keyof ItemRow, string[]> = {
  name: ["item name", "item", "name", "product", "product name", "menu item"],
  price: ["price", "sale price", "selling price", "sell price", "rate"],
  mrp: ["mrp", "m.r.p", "max retail price"],
  purchasePrice: ["purchase price", "cost price", "purchase", "cost", "buying price"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, " ");
}

function toMoneyString(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? String(num) : "";
}

async function parseExcelFile(file: File): Promise<ItemRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

  return rows
    .map((row) => {
      const entries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
      const findField = (field: keyof ItemRow) => {
        const aliases = HEADER_ALIASES[field];
        const match = entries.find(([header]) => aliases.includes(header));
        return match?.[1];
      };
      return {
        name: String(findField("name") ?? "").trim(),
        price: toMoneyString(findField("price")),
        mrp: toMoneyString(findField("mrp")),
        purchasePrice: toMoneyString(findField("purchasePrice")),
      };
    })
    .filter((row) => row.name && row.price);
}

function downloadTemplate() {
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet([
      { "Item Name": "Butter Chicken", Price: 250, MRP: "", "Purchase Price": 150 },
      { "Item Name": "Cold Drink 500ml", Price: 40, MRP: 40, "Purchase Price": 25 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Menu");
    XLSX.writeFile(wb, "kitchenos-menu-template.xlsx");
  });
}

export function QuickSetupWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addItemRow() {
    setItems((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportMessage(null);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        setImportMessage("Excel me koi item nahi mila. Niche diya template use karo.");
        return;
      }
      setItems(parsed);
      setImportMessage(`${parsed.length} item Excel se load ho gaye — neeche check karke confirm karo.`);
    } catch {
      setImportMessage("Ye file padh nahi paye. .xlsx ya .csv file try karo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
        const hasRetailFields = Boolean(item.mrp || item.purchasePrice);
        const product = await call<{ variants: { id: string }[] }>("/products", "POST", {
          brandId: brand.id,
          categoryId: category.id,
          taxCategoryId: taxCategory.id,
          name: item.name,
          sku: baseCode,
          variants: [
            {
              name: "Regular",
              sku: `${baseCode}-R`,
              basePrice: item.price,
              ...(hasRetailFields
                ? {
                    kind: "RETAIL_COMMODITY",
                    printedMRP: item.mrp || item.price,
                    purchasePrice: item.purchasePrice || undefined,
                  }
                : {}),
            },
          ],
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
        <p className="text-sm font-medium text-slate-700">Menu Excel se upload karo</p>
        <p className="mt-1 text-xs text-slate-500">
          Columns: Item Name, Price, MRP (optional), Purchase Price (optional).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileSelected}
            className="text-sm"
          />
          <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-slate-600 underline">
            Sample template download karo
          </button>
        </div>
        {importMessage ? <p className="mt-2 text-sm text-slate-600">{importMessage}</p> : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700">Menu items (Excel se aaye, ya yaha check/edit karo)</p>
        <div className="mt-3 space-y-2">
          <div className="hidden grid-cols-[1fr_6rem_6rem_7rem_2rem] gap-2 px-1 text-xs font-medium text-slate-400 sm:grid">
            <span>Item</span>
            <span>Price</span>
            <span>MRP</span>
            <span>Purchase</span>
            <span />
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_7rem_2rem]">
              <input
                placeholder="Item ka naam"
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
                className="col-span-2 rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-1"
              />
              <input
                placeholder="Price"
                inputMode="decimal"
                value={item.price}
                onChange={(e) => updateItem(index, "price", e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="MRP"
                inputMode="decimal"
                value={item.mrp}
                onChange={(e) => updateItem(index, "mrp", e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Purchase"
                inputMode="decimal"
                value={item.purchasePrice}
                onChange={(e) => updateItem(index, "purchasePrice", e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
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
