"use client";

import { useState } from "react";
import { Button, Icon, Select } from "@kitchenos/ui";

type Period = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month";

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aaj",
  yesterday: "Kal",
  this_week: "Is hafte",
  last_week: "Pichhla hafta",
  this_month: "Is mahine",
  last_month: "Pichhla mahina",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Week runs Monday to Sunday, which is how a restaurant's own week is counted
 *  here — not the JS default of Sunday first. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

function range(period: Period): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "this_week":
      return { from: startOfWeek(now), to: endOfDay(now) };
    case "last_week": {
      const start = startOfWeek(now);
      start.setDate(start.getDate() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: start, to: endOfDay(end) };
    }
    case "this_month":
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
  }
}

function stamp(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** Numbers go into the sheet as numbers, never as "₹1,240" text — a column of
 *  strings cannot be summed, and summing is the whole reason to open it in Excel. */
function num(value: string | number | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? Number(n) : 0;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`/api/catalog${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function ExportExcel({ outletId, brandId }: { outletId?: string; brandId?: string }) {
  const [period, setPeriod] = useState<Period>("this_month");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setIsBusy(true);
    try {
      const { from, to } = range(period);
      const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (outletId) q.set("outletId", outletId);
      if (brandId) q.set("brandId", brandId);
      const qs = `?${q.toString()}`;

      const [summary, byDay, topProducts, payments, promotions, profitLoss, hourly, weekday] = await Promise.all([
        getJson<Record<string, string | number>>(`/reports/sales-summary${qs}`, {}),
        getJson<{ date: string; total: string }[]>(`/reports/sales-by-day${qs}`, []),
        getJson<{ productName: string; variantName: string; quantitySold: number; revenue: string }[]>(
          `/reports/top-products${qs}&limit=50`,
          [],
        ),
        getJson<{ method: string; count: number; amount: string }[]>(`/reports/payment-methods${qs}`, []),
        getJson<{ code: string; redemptions: number; totalDiscount: string }[]>(`/reports/promotions${qs}`, []),
        getJson<Record<string, string>>(`/reports/profit-loss${qs}`, {}),
        getJson<{ hour: number; orderCount: number; total: string }[]>(`/reports/hourly-distribution${qs}`, []),
        getJson<{ weekday: number; orderCount: number; total: string }[]>(`/reports/weekday-distribution${qs}`, []),
      ]);

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const add = (name: string, rows: unknown[]) => {
        if (rows.length === 0) return;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
      };

      add("Summary", [
        { Field: "Period", Value: `${PERIOD_LABEL[period]} (${stamp(from)} to ${stamp(to)})` },
        { Field: "Orders", Value: num(summary.orderCount) },
        { Field: "Subtotal", Value: num(summary.subtotal as string) },
        { Field: "GST", Value: num(summary.taxTotal as string) },
        { Field: "Discount", Value: num(summary.discountAmount as string) },
        { Field: "Total sale", Value: num(summary.total as string) },
        { Field: "Average bill", Value: num(summary.averageOrderValue as string) },
        { Field: "Revenue", Value: num(profitLoss.revenue) },
        { Field: "Expenses", Value: num(profitLoss.expenses) },
        { Field: "Net profit", Value: num(profitLoss.netProfit) },
      ]);

      add(
        "Day wise",
        byDay.map((r) => ({ Date: r.date, Sale: num(r.total) })),
      );
      add(
        "Items",
        topProducts.map((r) => ({
          Item: r.productName,
          Variant: r.variantName,
          Qty: r.quantitySold,
          Revenue: num(r.revenue),
        })),
      );
      add(
        "Payments",
        payments.map((r) => ({ Method: r.method, Count: r.count, Amount: num(r.amount) })),
      );
      add(
        "Promotions",
        promotions.map((r) => ({ Code: r.code, Used: r.redemptions, Discount: num(r.totalDiscount) })),
      );
      add(
        "Hour wise",
        hourly.map((r) => ({
          Hour: `${String(r.hour).padStart(2, "0")}:00`,
          Orders: r.orderCount,
          Sale: num(r.total),
        })),
      );
      add(
        "Day of week",
        weekday.map((r) => ({
          Day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][r.weekday] ?? r.weekday,
          Orders: r.orderCount,
          Sale: num(r.total),
        })),
      );

      if (wb.SheetNames.length === 0) {
        setError("Is period me koi data nahi mila.");
        return;
      }

      XLSX.writeFile(wb, `kitchenos-sales-${period}-${stamp(from)}.xlsx`);
    } catch {
      setError("File ban nahi paayi. Dobara koshish karo.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="export-period" className="sr-only">
        Kis period ka report
      </label>
      <Select
        id="export-period"
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        options={(Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
      />
      <Button onClick={download} isLoading={isBusy} size="sm">
        <Icon name="install" size={16} />
        Excel download
      </Button>
      {error ? (
        <p className="text-sm font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
