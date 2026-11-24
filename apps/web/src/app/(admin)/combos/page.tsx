import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateComboForm } from "./create-combo-form";

interface Brand {
  id: string;
  name: string;
}

interface Variant {
  id: string;
  name: string;
}

interface Product {
  id: string;
  brandId: string;
  name: string;
  variants: Variant[];
}

interface Combo {
  id: string;
  name: string;
  comboPrice: string;
  isActive: boolean;
  brand: { name: string };
  items: { id: string; quantity: number; variant: { name: string; product: { name: string } } }[];
}

export default async function CombosPage() {
  const [brandsRes, productsRes, combosRes] = await Promise.all([
    apiFetch("/v1/brands"),
    apiFetch("/v1/products"),
    apiFetch("/v1/combos"),
  ]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const combos: Combo[] = combosRes.ok ? await combosRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Combos</h1>
      <p className="mt-2 text-sm text-ink-2">
        Bundle two or more variants from the same brand at a single bundle price. Ordering a combo on the POS
        expands it into one line per component, so kitchen routing and stock consumption work exactly as they
        would for ordinary items.
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateComboForm brands={brands} products={products} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">Components</th>
            <th className="px-4 py-2">Price</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {combos.map((combo) => (
            <tr key={combo.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">
                <Link href={`/combos/${combo.id}`} className="hover:underline">
                  {combo.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-ink-2">{combo.brand.name}</td>
              <td className="px-4 py-2 text-ink-2">
                {combo.items.map((i) => `${i.quantity}× ${i.variant.product.name} (${i.variant.name})`).join(", ")}
              </td>
              <td className="px-4 py-2 text-ink">₹{combo.comboPrice}</td>
              <td className="px-4 py-2">{combo.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {combos.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No combos yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
