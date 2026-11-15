import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreatePromotionForm } from "./create-promotion-form";

interface Brand {
  id: string;
  name: string;
}

interface Promotion {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FLAT";
  value: string;
  minOrderSubtotal: string | null;
  maxDiscountAmount: string | null;
  usageLimit: number | null;
  isActive: boolean;
  brand: { name: string } | null;
}

export default async function PromotionsPage() {
  const [brandsRes, promotionsRes] = await Promise.all([apiFetch("/v1/brands"), apiFetch("/v1/promotions")]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const promotions: Promotion[] = promotionsRes.ok ? await promotionsRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Promotions</h1>
      <p className="mt-2 text-sm text-slate-600">
        Coupon codes a cashier enters at the POS. At most one promotion can be active on an order at a time, and
        it discounts the order&apos;s final total rather than rewriting any line.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreatePromotionForm brands={brands} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">Discount</th>
            <th className="px-4 py-2">Min. subtotal</th>
            <th className="px-4 py-2">Usage limit</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {promotions.map((promo) => (
            <tr key={promo.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">{promo.code}</td>
              <td className="px-4 py-2 text-slate-500">{promo.brand?.name ?? "All brands"}</td>
              <td className="px-4 py-2 text-slate-500">
                {promo.type === "PERCENTAGE" ? `${promo.value}%` : `₹${promo.value}`}
                {promo.maxDiscountAmount ? ` (max ₹${promo.maxDiscountAmount})` : ""}
              </td>
              <td className="px-4 py-2 text-slate-500">{promo.minOrderSubtotal ? `₹${promo.minOrderSubtotal}` : "—"}</td>
              <td className="px-4 py-2 text-slate-500">{promo.usageLimit ?? "Unlimited"}</td>
              <td className="px-4 py-2">{promo.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`promotions/${promo.id}`} isActive={promo.isActive} />
              </td>
            </tr>
          ))}
          {promotions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                No promotion codes yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
