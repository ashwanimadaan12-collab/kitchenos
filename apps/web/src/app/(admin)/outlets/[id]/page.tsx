import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { UnmapButton } from "@/components/unmap-button";
import { MapKitchenForm } from "./map-kitchen-form";
import { SetPriceForm } from "./set-price-form";

interface OutletDetail {
  id: string;
  name: string;
  code: string;
  city: string | null;
  isActive: boolean;
  brand: { id: string; name: string };
  outletKitchens: { id: string; isPrimary: boolean; kitchen: { id: string; name: string } }[];
}

interface Kitchen {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  variants: { id: string; name: string; basePrice: string }[];
}

interface PriceOverride {
  id: string;
  variantId: string;
  price: string;
  variant: { name: string; basePrice: string; product: { name: string } };
}

export default async function OutletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [outletRes, kitchensRes] = await Promise.all([
    apiFetch(`/v1/outlets/${id}`),
    apiFetch("/v1/kitchens"),
  ]);

  if (outletRes.status === 404) notFound();
  if (!outletRes.ok) throw new Error("Failed to load outlet");

  const outlet: OutletDetail = await outletRes.json();
  const kitchens: Kitchen[] = kitchensRes.ok ? await kitchensRes.json() : [];
  const mappedKitchenIds = new Set(outlet.outletKitchens.map((ok) => ok.kitchen.id));
  const availableKitchens = kitchens.filter((k) => !mappedKitchenIds.has(k.id));

  const [productsRes, pricesRes] = await Promise.all([
    apiFetch(`/v1/products?brandId=${outlet.brand.id}`),
    apiFetch(`/v1/pricing/outlets/${outlet.id}`),
  ]);
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const priceOverrides: PriceOverride[] = pricesRes.ok ? await pricesRes.json() : [];
  const overriddenVariantIds = new Set(priceOverrides.map((p) => p.variantId));
  const availableVariants = products.flatMap((p) =>
    p.variants
      .filter((v) => !overriddenVariantIds.has(v.id))
      .map((v) => ({ id: v.id, label: `${p.name} — ${v.name} (base ₹${v.basePrice})` })),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{outlet.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {outlet.code} · {outlet.brand.name}
            {outlet.city ? ` · ${outlet.city}` : ""}
          </p>
        </div>
        <ToggleActiveButton path={`outlets/${outlet.id}`} isActive={outlet.isActive} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Fulfilling kitchens</h2>
        <p className="mt-1 text-sm text-slate-500">
          Typically the brand&apos;s primary kitchen plus the central warehouse for backend supply.
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <MapKitchenForm outletId={outlet.id} availableKitchens={availableKitchens} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Kitchen</th>
              <th className="px-4 py-2">Primary</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {outlet.outletKitchens.map((mapping) => (
              <tr key={mapping.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{mapping.kitchen.name}</td>
                <td className="px-4 py-2 text-slate-500">{mapping.isPrimary ? "Yes" : "No"}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`outlets/${outlet.id}/kitchens/${mapping.kitchen.id}`} />
                </td>
              </tr>
            ))}
            {outlet.outletKitchens.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No kitchens mapped yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Price overrides</h2>
        <p className="mt-1 text-sm text-slate-500">
          Charge a different price than the brand&apos;s base price at this outlet only.
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <SetPriceForm outletId={outlet.id} availableVariants={availableVariants} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Variant</th>
              <th className="px-4 py-2">Base price</th>
              <th className="px-4 py-2">Override price</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {priceOverrides.map((override) => (
              <tr key={override.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{override.variant.product.name}</td>
                <td className="px-4 py-2 text-slate-500">{override.variant.name}</td>
                <td className="px-4 py-2 text-slate-500">₹{override.variant.basePrice}</td>
                <td className="px-4 py-2 text-slate-900">₹{override.price}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton
                    path={`pricing/outlets/${outlet.id}/variants/${override.variantId}`}
                    label="Remove"
                  />
                </td>
              </tr>
            ))}
            {priceOverrides.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No price overrides — every variant sells at its base price here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
