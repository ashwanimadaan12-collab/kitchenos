import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { AddComboItemForm } from "./add-combo-item-form";
import { RemoveComboItemButton } from "./remove-combo-item-button";

interface ComboItem {
  id: string;
  variantId: string;
  quantity: number;
  variant: { name: string; product: { name: string } };
}

interface ComboDetail {
  id: string;
  name: string;
  description: string | null;
  comboPrice: string;
  isActive: boolean;
  brandId: string;
  brand: { name: string };
  items: ComboItem[];
}

interface Product {
  id: string;
  brandId: string;
  name: string;
  variants: { id: string; name: string }[];
}

export default async function ComboDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [comboRes, productsRes] = await Promise.all([apiFetch(`/v1/combos/${id}`), apiFetch("/v1/products")]);
  if (comboRes.status === 404) notFound();
  if (!comboRes.ok) throw new Error("Failed to load combo");
  const combo: ComboDetail = await comboRes.json();
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];

  const availableVariants = products
    .filter((p) => p.brandId === combo.brandId)
    .flatMap((p) => p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}` })))
    .filter((v) => !combo.items.some((i) => i.variantId === v.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{combo.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {combo.brand.name} · ₹{combo.comboPrice} · {combo.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <ToggleActiveButton path={`combos/${combo.id}`} isActive={combo.isActive} />
      </div>

      <table className="mt-6 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Component</th>
            <th className="px-4 py-2">Quantity</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {combo.items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">
                {item.variant.product.name} ({item.variant.name})
              </td>
              <td className="px-4 py-2 text-slate-500">{item.quantity}</td>
              <td className="px-4 py-2 text-right">
                <RemoveComboItemButton comboId={combo.id} variantId={item.variantId} disabled={combo.items.length <= 2} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <AddComboItemForm comboId={combo.id} variants={availableVariants} />
      </div>
    </div>
  );
}
