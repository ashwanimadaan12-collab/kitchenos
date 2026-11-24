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
  HIGH: "bg-bad-tint text-bad",
  MEDIUM: "bg-warn-tint text-warn",
  LOW: "bg-good-tint text-good",
  NONE: "bg-surface-2 text-ink-2",
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
      <h1 className="text-2xl font-semibold text-ink">Stock on hand</h1>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">Demand forecast &amp; reorder recommendations</h2>
          <form method="get" className="flex items-center gap-2 text-sm text-ink-2">
            Horizon
            <select name="horizonDays" defaultValue={effectiveHorizon} className="rounded-md border border-line px-2 py-1">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-white">
              Apply
            </button>
          </form>
        </div>
        <table className="mt-3 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
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
              <tr key={f.ingredientId} className="border-t border-line align-top">
                <td className="px-4 py-2 font-medium text-ink">
                  <details>
                    <summary className="cursor-pointer">{f.ingredientName}</summary>
                    <ul className="mt-1 list-disc pl-4 text-xs font-normal text-ink-2">
                      {f.explanation.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_BADGE[f.stockoutRisk]}`}>{f.stockoutRisk}</span>
                </td>
                <td className="px-4 py-2 text-ink-2">{f.daysOfStockRemaining !== null ? f.daysOfStockRemaining.toFixed(1) : "—"}</td>
                <td className="px-4 py-2 text-ink-2">
                  {f.forecastDemand}
                  {f.promotionUpliftApplied ? " (+promo)" : ""}
                </td>
                <td className="px-4 py-2 text-ink-2">
                  {f.leadTimeDays}d <span className="text-xs text-ink-3">({f.leadTimeSource.replace("_", " ")})</span>
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
                    <span className="font-medium text-warn">Reorder {f.reorderQuantitySuggested}</span>
                  ) : (
                    <span className="text-ink-3">OK</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-ink-2">
                  {f.excessInventory ? <div>Excess stock</div> : null}
                  {f.expiryRisk ? <div>Expiry risk</div> : null}
                  {!f.excessInventory && !f.expiryRisk ? "—" : null}
                </td>
              </tr>
            ))}
            {forecasts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                  No ingredients to forecast.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Stock on hand</h2>
        <div className="mt-3 rounded-lg border border-line bg-surface p-4">
          <AdjustStockForm kitchenId={kitchenId} ingredients={ingredients} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
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
                <tr key={balance.id} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">{balance.ingredient.name}</td>
                  <td className="px-4 py-2 text-ink-2">{balance.ingredient.unit}</td>
                  <td className={`px-4 py-2 ${low ? "font-medium text-bad" : "text-ink"}`}>
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
                <td colSpan={4} className="px-4 py-6 text-center text-ink-3">
                  No stock recorded at this kitchen yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Movement history</h2>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
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
              <tr key={movement.id} className="border-t border-line">
                <td className="px-4 py-2 text-ink-2">{new Date(movement.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 font-medium text-ink">{movement.ingredient.name}</td>
                <td className="px-4 py-2 text-ink-2">{movement.type}</td>
                <td className="px-4 py-2 text-ink">{movement.quantityDelta}</td>
                <td className="px-4 py-2 text-ink-2">{movement.note ?? "—"}</td>
              </tr>
            ))}
            {movements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
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
