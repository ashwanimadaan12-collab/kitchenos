import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateIngredientForm } from "./create-ingredient-form";
import { SetCostForm } from "./set-cost-form";

interface Ingredient {
  id: string;
  name: string;
  sku: string;
  kind: "RAW_MATERIAL" | "PACKAGING";
  unit: string;
  costPerUnit: string | null;
  preferredSupplierId: string | null;
  shelfLifeDays: number | null;
  isActive: boolean;
}

interface Supplier {
  id: string;
  name: string;
}

export default async function IngredientsPage() {
  const [res, suppliersRes] = await Promise.all([apiFetch("/v1/ingredients"), apiFetch("/v1/suppliers")]);
  const ingredients: Ingredient[] = res.ok ? await res.json() : [];
  const suppliers: Supplier[] = suppliersRes.ok ? await suppliersRes.json() : [];
  const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
  const rawMaterials = ingredients.filter((i) => i.kind === "RAW_MATERIAL");
  const packaging = ingredients.filter((i) => i.kind === "PACKAGING");

  function table(rows: Ingredient[], emptyLabel: string) {
    return (
      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">SKU</th>
            <th className="px-4 py-2">Unit</th>
            <th className="px-4 py-2">Cost / unit</th>
            <th className="px-4 py-2">Preferred supplier</th>
            <th className="px-4 py-2">Shelf life</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((ingredient) => (
            <tr key={ingredient.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">{ingredient.name}</td>
              <td className="px-4 py-2 text-ink-2">{ingredient.sku}</td>
              <td className="px-4 py-2 text-ink-2">{ingredient.unit}</td>
              <td className="px-4 py-2">
                <SetCostForm ingredientId={ingredient.id} currentCost={ingredient.costPerUnit} />
              </td>
              <td className="px-4 py-2 text-ink-2">
                {ingredient.preferredSupplierId ? supplierById.get(ingredient.preferredSupplierId) ?? "—" : "—"}
              </td>
              <td className="px-4 py-2 text-ink-2">{ingredient.shelfLifeDays ? `${ingredient.shelfLifeDays}d` : "—"}</td>
              <td className="px-4 py-2">{ingredient.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`ingredients/${ingredient.id}`} isActive={ingredient.isActive} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Ingredients</h1>
      <p className="mt-2 text-sm text-ink-2">
        Raw materials and packaging used by recipes. Packaging (boxes, cups, bags) is tracked the same way as
        food ingredients since both are just lines on a recipe&apos;s bill of materials. Setting a cost logs it
        to that ingredient&apos;s cost history rather than overwriting it silently. A preferred supplier and
        shelf life feed the inventory forecasting engine&apos;s lead-time and expiry-risk calculations.
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateIngredientForm suppliers={suppliers} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Raw materials</h2>
        {table(rawMaterials, "No raw materials yet.")}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Packaging</h2>
        {table(packaging, "No packaging materials yet.")}
      </section>
    </div>
  );
}
