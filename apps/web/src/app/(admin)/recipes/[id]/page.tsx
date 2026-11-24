import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { UnmapButton } from "@/components/unmap-button";
import { AddIngredientForm } from "./add-ingredient-form";
import { UpdateQuantityForm } from "./update-quantity-form";
import { AddOverheadForm } from "./add-overhead-form";

interface RecipeDetail {
  id: string;
  yieldQuantity: number;
  instructions: string | null;
  isActive: boolean;
  variant: { id: string; name: string; product: { name: string } };
  preparationStation: { id: string; name: string } | null;
  ingredients: { id: string; quantity: string; ingredient: { id: string; name: string; sku: string; unit: string } }[];
  overheadCosts: { id: string; label: string; amount: string }[];
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

interface CostBreakdown {
  ingredientCost: string;
  overheadCost: string;
  totalCost: string;
  yieldQuantity: number;
  costPerYieldUnit: string;
  sellingPrice: string;
  priceSource: "outlet_override" | "base_price";
  marginAmount: string;
  marginPercent: string | null;
  missingCostIngredientIds: string[];
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [recipeRes, ingredientsRes] = await Promise.all([
    apiFetch(`/v1/recipes/${id}`),
    apiFetch("/v1/ingredients"),
  ]);
  if (recipeRes.status === 404) notFound();
  if (!recipeRes.ok) throw new Error("Failed to load recipe");

  const recipe: RecipeDetail = await recipeRes.json();
  const ingredients: Ingredient[] = ingredientsRes.ok ? await ingredientsRes.json() : [];
  const usedIngredientIds = new Set(recipe.ingredients.map((line) => line.ingredient.id));
  const availableIngredients = ingredients
    .filter((i) => !usedIngredientIds.has(i.id))
    .map((i) => ({ id: i.id, label: `${i.name} (${i.unit})` }));

  const costRes = await apiFetch(`/v1/costing/variants/${recipe.variant.id}`);
  const cost: CostBreakdown | null = costRes.ok ? await costRes.json() : null;
  const ingredientById = new Map(recipe.ingredients.map((line) => [line.ingredient.id, line.ingredient]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {recipe.variant.product.name} — {recipe.variant.name}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Yields {recipe.yieldQuantity} · {recipe.preparationStation?.name ?? "No station assigned"}
          </p>
        </div>
        <ToggleActiveButton path={`recipes/${recipe.id}`} isActive={recipe.isActive} />
      </div>

      {recipe.instructions ? <p className="mt-4 text-sm text-ink-2">{recipe.instructions}</p> : null}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Bill of materials</h2>
        <div className="mt-3 rounded-lg border border-line bg-surface p-4">
          <AddIngredientForm recipeId={recipe.id} availableIngredients={availableIngredients} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Ingredient</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Quantity</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((line) => (
              <tr key={line.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{line.ingredient.name}</td>
                <td className="px-4 py-2 text-ink-2">{line.ingredient.sku}</td>
                <td className="px-4 py-2">
                  <UpdateQuantityForm
                    recipeId={recipe.id}
                    ingredientId={line.ingredient.id}
                    initialQuantity={line.quantity}
                  />
                </td>
                <td className="px-4 py-2 text-ink-2">{line.ingredient.unit}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`recipes/${recipe.id}/ingredients/${line.ingredient.id}`} label="Remove" />
                </td>
              </tr>
            ))}
            {recipe.ingredients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                  No ingredients yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Overhead costs</h2>
        <p className="mt-1 text-sm text-ink-2">Non-ingredient costs added on top of the bill of materials.</p>
        <div className="mt-3 rounded-lg border border-line bg-surface p-4">
          <AddOverheadForm recipeId={recipe.id} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {recipe.overheadCosts.map((overhead) => (
              <tr key={overhead.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{overhead.label}</td>
                <td className="px-4 py-2 text-ink-2">₹{overhead.amount}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`costing/recipes/${recipe.id}/overheads/${overhead.id}`} label="Remove" />
                </td>
              </tr>
            ))}
            {recipe.overheadCosts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                  No overhead costs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Cost &amp; margin</h2>
        {cost ? (
          <div className="mt-3 grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-2">Ingredient cost</p>
              <p className="mt-1 font-medium text-ink">₹{cost.ingredientCost}</p>
            </div>
            <div>
              <p className="text-xs text-ink-2">Overhead cost</p>
              <p className="mt-1 font-medium text-ink">₹{cost.overheadCost}</p>
            </div>
            <div>
              <p className="text-xs text-ink-2">Total cost / yield unit</p>
              <p className="mt-1 font-medium text-ink">₹{cost.costPerYieldUnit}</p>
            </div>
            <div>
              <p className="text-xs text-ink-2">
                Selling price {cost.priceSource === "outlet_override" ? "(outlet override)" : "(base price)"}
              </p>
              <p className="mt-1 font-medium text-ink">₹{cost.sellingPrice}</p>
            </div>
            <div>
              <p className="text-xs text-ink-2">Margin</p>
              <p className="mt-1 font-medium text-ink">
                ₹{cost.marginAmount}
                {cost.marginPercent !== null ? ` (${Number(cost.marginPercent).toFixed(1)}%)` : ""}
              </p>
            </div>
            {cost.missingCostIngredientIds.length > 0 ? (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs text-warn">
                  Missing cost data for: {cost.missingCostIngredientIds.map((id) => ingredientById.get(id)?.name ?? id).join(", ")}
                  &nbsp;— set their cost on the Ingredients page for an accurate total.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Cost breakdown unavailable.</p>
        )}
      </section>
    </div>
  );
}
