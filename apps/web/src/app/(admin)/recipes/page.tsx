import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateRecipeForm } from "./create-recipe-form";

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  brandId: string;
  name: string;
  variants: { id: string; name: string }[];
}

interface Kitchen {
  id: string;
  name: string;
  stations: { id: string; name: string }[];
}

interface Recipe {
  id: string;
  yieldQuantity: number;
  isActive: boolean;
  variant: { id: string; name: string; product: { name: string; brandId: string } };
  preparationStation: { name: string } | null;
  ingredients: { id: string }[];
}

export default async function RecipesPage() {
  const [brandsRes, productsRes, kitchensRes, recipesRes] = await Promise.all([
    apiFetch("/v1/brands"),
    apiFetch("/v1/products"),
    apiFetch("/v1/kitchens"),
    apiFetch("/v1/recipes"),
  ]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const kitchens: Kitchen[] = kitchensRes.ok ? await kitchensRes.json() : [];
  const recipes: Recipe[] = recipesRes.ok ? await recipesRes.json() : [];

  const stations = kitchens.flatMap((k) => k.stations.map((s) => ({ id: s.id, label: `${k.name} — ${s.name}` })));
  const variantIdsWithRecipes = recipes.map((r) => r.variant.id);
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Recipes</h1>
      <p className="mt-2 text-sm text-slate-600">
        The bill of materials for a variant — which ingredients (and packaging) it consumes, and which kitchen
        station prepares it. Prompt 05&apos;s costing engine will price a variant from this.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreateRecipeForm
          brands={brands}
          products={products}
          stations={stations}
          variantIdsWithRecipes={variantIdsWithRecipes}
        />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2">Variant</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">Station</th>
            <th className="px-4 py-2">Ingredients</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe) => (
            <tr key={recipe.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                <Link href={`/recipes/${recipe.id}`} className="hover:underline">
                  {recipe.variant.product.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-slate-500">{recipe.variant.name}</td>
              <td className="px-4 py-2 text-slate-500">{brandNameById.get(recipe.variant.product.brandId)}</td>
              <td className="px-4 py-2 text-slate-500">{recipe.preparationStation?.name ?? "—"}</td>
              <td className="px-4 py-2 text-slate-500">{recipe.ingredients.length}</td>
              <td className="px-4 py-2">{recipe.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {recipes.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                No recipes yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
