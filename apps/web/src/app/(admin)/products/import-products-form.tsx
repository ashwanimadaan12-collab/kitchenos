"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@kitchenos/ui";

interface ItemRow {
  name: string;
  price: string;
  mrp: string;
  purchasePrice: string;
}

interface ImportProductsFormProps {
  brands: { id: string; name: string }[];
  categories: { id: string; brandId: string; name: string }[];
  taxCategories: { id: string; name: string }[];
  outlets: { id: string; brandId: string; name: string }[];
  menus: { id: string; brandId: string; name: string }[];
  kitchens: { id: string; stations: { id: string; isActive: boolean }[]; brandKitchens: { brand: { id: string } }[] }[];
}

const EMPTY_ROW: ItemRow = { name: "", price: "", mrp: "", purchasePrice: "" };

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

export function ImportProductsForm({ brands, categories, taxCategories, outlets, menus, kitchens }: ImportProductsFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const brandCategories = useMemo(() => categories.filter((c) => c.brandId === brandId), [categories, brandId]);
  const brandOutlets = useMemo(() => outlets.filter((o) => o.brandId === brandId), [outlets, brandId]);
  const brandMenus = useMemo(() => menus.filter((m) => m.brandId === brandId), [menus, brandId]);

  const [categoryId, setCategoryId] = useState(() => categories.find((c) => c.brandId === brandId)?.id ?? "");
  const [taxCategoryId, setTaxCategoryId] = useState(taxCategories[0]?.id ?? "");
  const [outletId, setOutletId] = useState(() => outlets.find((o) => o.brandId === brandId)?.id ?? "");
  const [menuId, setMenuId] = useState(() => menus.find((m) => m.brandId === brandId)?.id ?? "");

  function syncDefaults(forBrandId: string) {
    setCategoryId(categories.find((c) => c.brandId === forBrandId)?.id ?? "");
    setOutletId(outlets.find((o) => o.brandId === forBrandId)?.id ?? "");
    setMenuId(menus.find((m) => m.brandId === forBrandId)?.id ?? "");
  }

  function onBrandChange(value: string) {
    setBrandId(value);
    syncDefaults(value);
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportMessage(null);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        setImportMessage("Excel me koi item nahi mila. Sample template check karo.");
        return;
      }
      setItems(parsed);
      setImportMessage(`${parsed.length} item mile — neeche check karke "Import karo" dabao.`);
    } catch {
      setImportMessage("Ye file padh nahi paye. .xlsx ya .csv file try karo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onImport() {
    setError(null);
    if (!brandId) {
      setError("Brand chuno.");
      return;
    }
    if (!categoryId || !taxCategoryId) {
      setError("Category aur Tax category chuno (Products page ke upar bana sakte ho agar nahi hai).");
      return;
    }
    const validItems = items.filter((item) => item.name.trim() && item.price.trim());
    if (validItems.length === 0) {
      setError("Kam se kam ek item (naam + price) hona chahiye.");
      return;
    }

    setIsSubmitting(true);
    try {
      const kitchen = kitchens.find((k) => k.brandKitchens.some((bk) => bk.brand.id === brandId));
      let stationId = kitchen?.stations.find((s) => s.isActive)?.id;
      if (kitchen && !stationId) {
        const station = await call<{ id: string }>(`/kitchens/${kitchen.id}/stations`, "POST", {
          name: "Main Station",
          code: codify(`K${kitchen.id.slice(-6)}-ST`, 30),
        });
        stationId = station.id;
      }

      for (let i = 0; i < validItems.length; i += 1) {
        const item = validItems[i];
        if (!item) continue;
        setProgress(`Import kar rahe hain (${i + 1}/${validItems.length}): ${item.name}`);
        const baseCode = codify(`${item.name}-${Date.now()}-${i}`, 36);
        const hasRetailFields = Boolean(item.mrp || item.purchasePrice);
        const product = await call<{ variants: { id: string }[] }>("/products", "POST", {
          brandId,
          categoryId,
          taxCategoryId,
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
        if (menuId) await call("/menus/" + menuId + "/items", "POST", { variantId });
        if (outletId) await call(`/pricing/outlets/${outletId}/variants/${variantId}`, "PUT", { price: item.price });
        if (stationId) await call("/recipes", "POST", { variantId, preparationStationId: stationId });
      }
      setProgress(
        stationId
          ? "Done! Products add ho gaye aur kitchen screen se bhi jud gaye."
          : "Done! Products add ho gaye, lekin is brand ka koi kitchen nahi mila — KDS me nahi dikhenge jab tak Kitchens page se brand map na karo.",
      );
      setItems([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya, dobara try karo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Excel columns: Item Name, Price, MRP (optional), Purchase Price (optional). Agar MRP/Purchase Price doge to
        item retail-commodity (jaise packaged drinks) ke tarah save hoga.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Brand</label>
          <Select
            aria-label="Brand"
            value={brandId}
            onChange={(e) => onBrandChange(e.target.value)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Brand chuno"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Category</label>
          <Select
            aria-label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={brandCategories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Category chuno"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Tax category</label>
          <Select
            aria-label="Tax category"
            value={taxCategoryId}
            onChange={(e) => setTaxCategoryId(e.target.value)}
            options={taxCategories.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Tax chuno"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Menu + Outlet price</label>
          <div className="flex gap-2">
            <Select
              aria-label="Menu"
              value={menuId}
              onChange={(e) => setMenuId(e.target.value)}
              options={brandMenus.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="Menu (optional)"
            />
            <Select
              aria-label="Outlet"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              options={brandOutlets.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Outlet (optional)"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileSelected} className="text-sm" />
        <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-slate-600 underline">
          Sample template download karo
        </button>
      </div>
      {importMessage ? <p className="text-sm text-slate-600">{importMessage}</p> : null}

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_7rem_2rem]">
              <input
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
                className="col-span-2 rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-1"
              />
              <input
                inputMode="decimal"
                value={item.price}
                onChange={(e) => updateItem(index, "price", e.target.value)}
                placeholder="Price"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                inputMode="decimal"
                value={item.mrp}
                onChange={(e) => updateItem(index, "mrp", e.target.value)}
                placeholder="MRP"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                inputMode="decimal"
                value={item.purchasePrice}
                onChange={(e) => updateItem(index, "purchasePrice", e.target.value)}
                placeholder="Purchase"
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
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {progress && !error ? <p className="text-sm text-slate-600">{progress}</p> : null}

      {items.length > 0 ? (
        <Button type="button" isLoading={isSubmitting} onClick={onImport}>
          Import karo ({items.length} items)
        </Button>
      ) : null}
    </div>
  );
}
