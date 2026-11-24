import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateTaxCategoryForm } from "./create-tax-category-form";
import { CreateProductCategoryForm } from "./create-product-category-form";
import { CreateProductForm } from "./create-product-form";
import { ImportProductsForm } from "./import-products-form";

interface Brand {
  id: string;
  name: string;
}

interface TaxCategory {
  id: string;
  name: string;
  ratePercent: string;
  isActive: boolean;
}

interface ProductCategory {
  id: string;
  brandId: string;
  name: string;
  isActive: boolean;
}

interface Product {
  id: string;
  brandId: string;
  name: string;
  sku: string;
  isActive: boolean;
  category: { name: string };
  taxCategory: { name: string } | null;
  variants: { id: string; name: string; basePrice: string }[];
}

interface Outlet {
  id: string;
  brandId: string;
  name: string;
}

interface Menu {
  id: string;
  brandId: string;
  name: string;
}

interface Kitchen {
  id: string;
  stations: { id: string; isActive: boolean }[];
  brandKitchens: { brand: { id: string } }[];
}

export default async function ProductsPage() {
  const [brandsRes, taxCategoriesRes, categoriesRes, productsRes, outletsRes, menusRes, kitchensRes] =
    await Promise.all([
      apiFetch("/v1/brands"),
      apiFetch("/v1/tax-categories"),
      apiFetch("/v1/product-categories"),
      apiFetch("/v1/products"),
      apiFetch("/v1/outlets"),
      apiFetch("/v1/menus"),
      apiFetch("/v1/kitchens"),
    ]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const taxCategories: TaxCategory[] = taxCategoriesRes.ok ? await taxCategoriesRes.json() : [];
  const categories: ProductCategory[] = categoriesRes.ok ? await categoriesRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const menus: Menu[] = menusRes.ok ? await menusRes.json() : [];
  const kitchens: Kitchen[] = kitchensRes.ok ? await kitchensRes.json() : [];

  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Products</h1>
      <p className="mt-2 text-sm text-ink-2">
        Menu items are priced and sold through their variants (e.g. sizes) — add at least one when creating a
        product, then manage the rest from the product&apos;s own page.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Excel se bulk import karo</h2>
        <div className="mt-2 rounded-lg border border-line bg-surface p-4">
          <ImportProductsForm
            brands={brands}
            categories={categories}
            taxCategories={taxCategories}
            outlets={outlets}
            menus={menus}
            kitchens={kitchens}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Tax categories</h2>
        <div className="mt-2 rounded-lg border border-line bg-surface p-4">
          <CreateTaxCategoryForm />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-ink-2">
          {taxCategories.map((t) => (
            <span key={t.id} className="rounded-full border border-line bg-surface px-3 py-1">
              {t.name} ({t.ratePercent}%)
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Categories</h2>
        <div className="mt-2 rounded-lg border border-line bg-surface p-4">
          <CreateProductCategoryForm brands={brands} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-ink-2">
          {categories.map((c) => (
            <span key={c.id} className="rounded-full border border-line bg-surface px-3 py-1">
              {brandNameById.get(c.brandId)} / {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Products</h2>
        <div className="mt-2 rounded-lg border border-line bg-surface p-4">
          <CreateProductForm brands={brands} categories={categories} taxCategories={taxCategories} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Tax</th>
              <th className="px-4 py-2">Variants</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">
                  <Link href={`/products/${product.id}`} className="hover:underline">
                    {product.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-3">{product.sku}</span>
                </td>
                <td className="px-4 py-2 text-ink-2">{brandNameById.get(product.brandId)}</td>
                <td className="px-4 py-2 text-ink-2">{product.category.name}</td>
                <td className="px-4 py-2 text-ink-2">{product.taxCategory?.name ?? "—"}</td>
                <td className="px-4 py-2 text-ink-2">
                  {product.variants.map((v) => `${v.name} (₹${v.basePrice})`).join(", ")}
                </td>
                <td className="px-4 py-2">{product.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No products yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
