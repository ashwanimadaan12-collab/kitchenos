import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { UnmapButton } from "@/components/unmap-button";
import { AddItemForm } from "./add-item-form";
import { AssignOutletForm } from "./assign-outlet-form";

interface MenuDetail {
  id: string;
  brandId: string;
  name: string;
  isActive: boolean;
  items: { id: string; isAvailable: boolean; variant: { id: string; name: string; product: { name: string } } }[];
  outletMenus: { id: string; channel: string; outlet: { id: string; name: string } }[];
}

interface Product {
  id: string;
  name: string;
  variants: { id: string; name: string }[];
}

interface Outlet {
  id: string;
  name: string;
}

export default async function MenuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const menuRes = await apiFetch(`/v1/menus/${id}`);
  if (menuRes.status === 404) notFound();
  if (!menuRes.ok) throw new Error("Failed to load menu");
  const menu: MenuDetail = await menuRes.json();

  const [productsRes, outletsRes] = await Promise.all([
    apiFetch(`/v1/products?brandId=${menu.brandId}`),
    apiFetch(`/v1/outlets?brandId=${menu.brandId}`),
  ]);
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];

  const menuVariantIds = new Set(menu.items.map((i) => i.variant.id));
  const availableVariants = products.flatMap((p) =>
    p.variants.filter((v) => !menuVariantIds.has(v.id)).map((v) => ({ id: v.id, label: `${p.name} — ${v.name}` })),
  );
  const assignedOutletIds = new Set(menu.outletMenus.map((om) => om.outlet.id));
  const availableOutlets = outlets.filter((o) => !assignedOutletIds.has(o.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{menu.name}</h1>
        <ToggleActiveButton path={`menus/${menu.id}`} isActive={menu.isActive} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Items</h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <AddItemForm menuId={menu.id} availableVariants={availableVariants} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Variant</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {menu.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{item.variant.product.name}</td>
                <td className="px-4 py-2 text-slate-500">{item.variant.name}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`menus/${menu.id}/items/${item.variant.id}`} />
                </td>
              </tr>
            ))}
            {menu.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-slate-900">Outlets running this menu</h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
          <AssignOutletForm menuId={menu.id} availableOutlets={availableOutlets} />
        </div>
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Outlet</th>
              <th className="px-4 py-2">Channel</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {menu.outletMenus.map((mapping) => (
              <tr key={mapping.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{mapping.outlet.name}</td>
                <td className="px-4 py-2 text-slate-500">{mapping.channel}</td>
                <td className="px-4 py-2 text-right">
                  <UnmapButton path={`menus/${menu.id}/outlets/${mapping.outlet.id}`} />
                </td>
              </tr>
            ))}
            {menu.outletMenus.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  Not assigned to any outlet yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
