import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateMenuForm } from "./create-menu-form";

interface Brand {
  id: string;
  name: string;
}

interface Menu {
  id: string;
  brandId: string;
  name: string;
  isActive: boolean;
  items: { id: string }[];
  outletMenus: { outlet: { name: string } }[];
}

export default async function MenusPage() {
  const [brandsRes, menusRes] = await Promise.all([apiFetch("/v1/brands"), apiFetch("/v1/menus")]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const menus: Menu[] = menusRes.ok ? await menusRes.json() : [];
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Menus</h1>
      <p className="mt-2 text-sm text-ink-2">
        A named, orderable collection of variants within a brand (e.g. Dine-in vs Delivery). Open a menu to
        manage its items and which outlets it runs at.
      </p>

      <div className="mt-4">
        <CreateMenuForm brands={brands} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">Items</th>
            <th className="px-4 py-2">Outlets</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {menus.map((menu) => (
            <tr key={menu.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">
                <Link href={`/menus/${menu.id}`} className="hover:underline">
                  {menu.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-ink-2">{brandNameById.get(menu.brandId)}</td>
              <td className="px-4 py-2 text-ink-2">{menu.items.length}</td>
              <td className="px-4 py-2 text-ink-2">
                {menu.outletMenus.map((om) => om.outlet.name).join(", ") || "—"}
              </td>
              <td className="px-4 py-2">{menu.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {menus.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No menus yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
