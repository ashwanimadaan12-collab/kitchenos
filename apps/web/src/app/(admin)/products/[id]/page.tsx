import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { AddVariantForm } from "./add-variant-form";

interface ProductDetail {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  isActive: boolean;
  category: { name: string };
  taxCategory: { name: string; ratePercent: string } | null;
  variants: {
    id: string;
    name: string;
    sku: string;
    basePrice: string;
    isActive: boolean;
    kind: "PREPARED_FOOD" | "RETAIL_COMMODITY";
    printedMRP: string | null;
  }[];
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/v1/products/${id}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load product");
  const product: ProductDetail = await res.json();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {product.sku} · {product.category.name}
            {product.taxCategory ? ` · ${product.taxCategory.name} (${product.taxCategory.ratePercent}%)` : ""}
          </p>
        </div>
        <ToggleActiveButton path={`products/${product.id}`} isActive={product.isActive} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Variants</h2>
        <p className="mt-1 text-sm text-slate-500">
          Each variant is independently sellable and priced — outlets can override its base price.
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <AddVariantForm productId={product.id} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Base price</th>
              <th className="px-4 py-2">Kind</th>
              <th className="px-4 py-2">Printed MRP</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{variant.name}</td>
                <td className="px-4 py-2 text-slate-500">{variant.sku}</td>
                <td className="px-4 py-2 text-slate-500">₹{variant.basePrice}</td>
                <td className="px-4 py-2 text-slate-500">
                  {variant.kind === "RETAIL_COMMODITY" ? "Retail commodity" : "Prepared food"}
                </td>
                <td className="px-4 py-2 text-slate-500">{variant.printedMRP ? `₹${variant.printedMRP}` : "—"}</td>
                <td className="px-4 py-2">{variant.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/pricing?variantId=${variant.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    Pricing rules →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
