import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AdjustStockForm } from "./adjust-stock-form";
import { ReorderPointForm } from "./reorder-point-form";
import { ForecastOverrideForm } from "./forecast-override-form";

interface StockBalance {
  id: string;
  ingredientId: string;
  quantityOnHand: string;
  reorderPoint: string | null;
  ingredient: { name: string; sku: string; unit: string };
}

interface Movement {
  id: string;
  type: string;
  quantityDelta: string;
  note: string | null;
  createdAt: string;
  ingredient: { name: string };
}

interface Ingredient {
  id: string;
  name: string;
}

interface IngredientForecast {
  ingredientId: string;
  ingredientName: string;
  horizonDays: number;
  quantityOnHand: string;
  incomingQuantity: string;
  averageDailyDemand: string;
  forecastDemand: string;
  daysOfStockRemaining: number | null;
  leadTimeDays: number;
  leadTimeSource: string;
  safetyStock: string;
  safetyStockSource: string;
  reorderPoint: string;
  reorderPointSource: string;
  reorderRecommended: boolean;
  reorderQuantitySuggested: string;
  stockoutRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  excessInventory: boolean;
  expiryRisk: boolean;
  promotionUpliftApplied: boolean;
  explanation: string[];
}

const RISK_BADGE: Record<IngredientForecast["stockoutRisk"], string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-emerald-100 text-emerald-700",
  NONE: "bg-slate-100 text-slate-500",
};

export default async function KitchenStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ kitchenId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { kitchenId } = await params;
  const { horizonDays } = await searchParams;
  const effectiveHorizon = horizonDays && ["7", "14", "30"].includes(horizonDays) ? horizonDays : "14";

  const [stockRes, movementsRes, ingredientsRes, forecastRes] = await Promise.all([
    apiFetch(`/v1/inventory/kitchens/${kitchenId}/stock`),
    apiFetch(`/v1/inventory/kitchens/${kitchenId}/movements`),
    apiFetch("/v1/ingredients"),
    apiFetch(`/v1/inventory/kitchens/${kitchenId}/forecast?horizonDays=${effectiveHorizon}`),
  ]);
  if (stockRes.status === 404) notFound();
  if (!stockRes.ok) throw new Error("Failed to load stock");

  const stock: StockBalance[] = await stockRes.json();
  const movements: Movement[] = movementsRes.ok ? await movementsRes.json() : [];
  const ingredients: Ingredient[] = ingredientsRes.ok ? await ingredientsRes.json() : [];
  const forecasts: IngredientForecast[] = forecastRes.ok ? await forecastRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Stock on hand</h1>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Demand forecast &amp; reorder recommendations</h2>
          <form method="get" className="flex items-center gap-2 text-sm text-slate-600">
            Horizon
            <select name="horizonDays" defaultValue={effectiveHorizon} className="rounded-md border border-slate-200 px-2 py-1">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-white">
              Apply
            </button>
          </form>
        </div>
        <table className="mt-3 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Ingredient</th>
              <th className="px-4 py-2">Risk</th>
              <th className="px-4 py-2">Days left</th>
              <th className="px-4 py-2">Forecast demand</th>
              <th className="px-4 py-2">Lead time</th>
              <th className="px-4 py-2">Safety stock / lead time override</th>
              <th className="px-4 py-2">Reorder</th>
              <th className="px-4 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => (
              <tr key={f.ingredientId} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2 font-medium text-slate-900">
                  <details>
                    <summary className="cursor-pointer">{f.ingredientName}</summary>
                    <ul className="mt-1 list-disc pl-4 text-xs font-normal text-slate-500">
                      {f.explanation.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_BADGE[f.stockoutRisk]}`}>{f.stockoutRisk}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">{f.daysOfStockRemaining !== null ? f.daysOfStockRemaining.toFixed(1) : "—"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {f.forecastDemand}
                  {f.promotionUpliftApplied ? " (+promo)" : ""}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {f.leadTimeDays}d <span className="text-xs text-slate-400">({f.leadTimeSource.replace("_", " ")})</span>
                </td>
                <td className="px-4 py-2">
                  <ForecastOverrideForm
                    kitchenId={kitchenId}
                    ingredientId={f.ingredientId}
                    initialSafetyStock={f.safetyStockSource === "override" ? f.safetyStock : null}
                    initialLeadTimeDays={f.leadTimeSource === "override" ? f.leadTimeDays : null}
                  />
                </td>
                <td className="px-4 py-2">
                  {f.reorderRecommended ? (
                    <span className="font-medium text-amber-700">Reorder {f.reorderQuantitySuggested}</span>
                  ) : (
                    <span className="text-slate-400">OK</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {f.excessInventory ? <div>Excess stock</div> : null}
                  {f.expiryRisk ? <div>Expiry risk</div> : null}
                  {!f.excessInventory && !f.expiryRisk ? "—" : null}
                </td>
              </tr>
            ))}
            {forecasts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  No ingredients to forecast.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Stock on hand</h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <AdjustStockForm kitchenId={kitchenId} ingredients={ingredients} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Ingredient</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Qty on hand</th>
              <th className="px-4 py-2">Reorder point</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((balance) => {
              const low = balance.reorderPoint !== null && Number(balance.quantityOnHand) <= Number(balance.reorderPoint);
              return (
                <tr key={balance.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{balance.ingredient.name}</td>
                  <td className="px-4 py-2 text-slate-500">{balance.ingredient.unit}</td>
                  <td className={`px-4 py-2 ${low ? "font-medium text-red-600" : "text-slate-900"}`}>
                    {balance.quantityOnHand}
                    {low ? " (low)" : ""}
                  </td>
                  <td className="px-4 py-2">
                    <ReorderPointForm kitchenId={kitchenId} ingredientId={balance.ingredientId} initialValue={balance.reorderPoint} />
                  </td>
                </tr>
              );
            })}
            {stock.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No stock recorded at this kitchen yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Movement history</h2>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Ingredient</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Quantity</th>
              <th className="px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{new Date(movement.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium text-slate-900">{movement.ingredient.name}</td>
                <td className="px-4 py-2 text-slate-500">{movement.type}</td>
                <td className="px-4 py-2 text-slate-900">{movement.quantityDelta}</td>
                <td className="px-4 py-2 text-slate-500">{movement.note ?? "—"}</td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No movements yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
