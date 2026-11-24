import { notFound } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { UnmapButton } from "@/components/unmap-button";
import { AddItemForm } from "./add-item-form";
import { AddComboForm } from "./add-combo-form";
import { ItemQuantityForm } from "./item-quantity-form";
import { AddPaymentForm } from "./add-payment-form";
import { VoidOrderButton } from "./void-order-button";
import { PromotionForm } from "./promotion-form";
import { LoyaltyRedemptionForm } from "./loyalty-redemption-form";
import { CustomerForm } from "./customer-form";
import { MoreOptions } from "./more-options";
import { KotButtons } from "./kot-buttons";

interface OrderItem {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  status: "ACTIVE" | "VOIDED";
  comboId: string | null;
  comboInstanceId: string | null;
}

interface Payment {
  id: string;
  method: string;
  amount: string;
  referenceNumber: string | null;
  createdAt: string;
}

interface OrderDetail {
  id: string;
  orderNumber: number;
  channel: string;
  status: "OPEN" | "PAID" | "VOIDED";
  subtotal: string;
  taxTotal: string;
  discountAmount: string;
  loyaltyDiscountAmount: string;
  loyaltyPointsRedeemed: number;
  total: string;
  outlet: { id: string; name: string; brandId: string };
  items: OrderItem[];
  payments: Payment[];
  promotion: { code: string } | null;
  customer: { id: string; name: string; loyaltyPoints: number } | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Menu {
  id: string;
  isActive: boolean;
  outletMenus: { outlet: { id: string }; isActive: boolean }[];
  items: {
    isAvailable: boolean;
    variant: { id: string; name: string; basePrice: string; product: { name: string } };
  }[];
  comboItems: { isAvailable: boolean; combo: { id: string; name: string } }[];
}

interface Product {
  category: { name: string } | null;
  variants: { id: string }[];
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderRes = await apiFetch(`/v1/orders/${id}`);
  if (orderRes.status === 404) notFound();
  if (!orderRes.ok) throw new Error("Failed to load order");
  const order: OrderDetail = await orderRes.json();

  const [menusRes, customersRes, productsRes] = await Promise.all([
    apiFetch(`/v1/menus?brandId=${order.outlet.brandId}`),
    apiFetch("/v1/customers"),
    apiFetch(`/v1/products?brandId=${order.outlet.brandId}`),
  ]);
  const menus: Menu[] = menusRes.ok ? await menusRes.json() : [];
  const customers: Customer[] = customersRes.ok ? await customersRes.json() : [];
  const products: Product[] = productsRes.ok ? await productsRes.json() : [];

  const categoryNameByVariantId = new Map<string, string>();
  for (const product of products) {
    for (const variant of product.variants) {
      categoryNameByVariantId.set(variant.id, product.category?.name ?? "Other");
    }
  }

  const activeMenus = menus.filter(
    (m) => m.isActive && m.outletMenus.some((om) => om.outlet.id === order.outlet.id && om.isActive),
  );
  const availableVariants = activeMenus
    .flatMap((m) => m.items)
    .filter((item) => item.isAvailable)
    .map((item) => ({
      id: item.variant.id,
      label: `${item.variant.product.name} — ${item.variant.name}`,
      category: categoryNameByVariantId.get(item.variant.id) ?? "Other",
      price: item.variant.basePrice,
    }));
  const availableCombos = activeMenus
    .flatMap((m) => m.comboItems)
    .filter((item) => item.isAvailable)
    .map((item) => ({ id: item.combo.id, label: item.combo.name }));

  const activeItems = order.items.filter((i) => i.status === "ACTIVE");
  const voidedItems = order.items.filter((i) => i.status === "VOIDED");
  const totalPaid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Math.max(Number(order.total) - totalPaid, 0).toFixed(2);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            Order #{order.orderNumber} · {order.outlet.name}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {order.channel} · {order.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <KotButtons
            orderId={order.id}
            itemIds={activeItems.map((i) => i.id)}
            isOpen={order.status === "OPEN"}
          />
          {order.status === "OPEN" && order.payments.length === 0 ? <VoidOrderButton orderId={order.id} /> : null}
        </div>
      </div>

      {order.status === "OPEN" ? (
        <section className="mt-6">
          <div className="rounded-lg border border-line bg-surface p-4">
            <AddItemForm
              orderId={order.id}
              availableVariants={availableVariants}
              activeItems={activeItems
                .filter((i) => !i.comboInstanceId)
                .map((i) => ({ id: i.id, variantId: i.variantId, quantity: i.quantity }))}
            />
            {availableCombos.length > 0 ? (
              <div className="mt-4 border-t border-line pt-4">
                <AddComboForm orderId={order.id} availableCombos={availableCombos} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Item</th>
            <th className="px-4 py-2">Unit price</th>
            <th className="px-4 py-2">Qty</th>
            <th className="px-4 py-2">Line total</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item) => (
            <tr key={item.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">
                {item.comboId ? <span className="mr-1 text-xs text-ink-3">combo ·</span> : null}
                {item.productName} — {item.variantName}
              </td>
              <td className="px-4 py-2 text-ink-2">₹{item.unitPrice}</td>
              <td className="px-4 py-2">
                {order.status === "OPEN" && !item.comboInstanceId ? (
                  <ItemQuantityForm orderId={order.id} itemId={item.id} initialQuantity={item.quantity} />
                ) : (
                  item.quantity
                )}
              </td>
              <td className="px-4 py-2 text-ink">₹{item.lineTotal}</td>
              <td className="px-4 py-2 text-right">
                {order.status === "OPEN" ? (
                  item.comboInstanceId ? (
                    <UnmapButton path={`orders/${order.id}/combo-items/${item.comboInstanceId}`} label="Void combo" />
                  ) : (
                    <UnmapButton path={`orders/${order.id}/items/${item.id}`} label="Void" />
                  )
                ) : null}
              </td>
            </tr>
          ))}
          {voidedItems.map((item) => (
            <tr key={item.id} className="border-t border-line text-ink-3 line-through">
              <td className="px-4 py-2">
                {item.productName} — {item.variantName}
              </td>
              <td className="px-4 py-2">₹{item.unitPrice}</td>
              <td className="px-4 py-2">{item.quantity}</td>
              <td className="px-4 py-2">₹{item.lineTotal}</td>
              <td className="px-4 py-2 text-right text-xs">voided</td>
            </tr>
          ))}
          {order.items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No items yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {order.status === "OPEN" ? (
        <MoreOptions>
          <div className="rounded-lg border border-line bg-surface p-4">
            <CustomerForm
              orderId={order.id}
              customers={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.phone})` }))}
              linkedCustomer={order.customer}
            />
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <PromotionForm orderId={order.id} appliedCode={order.promotion?.code ?? null} />
          </div>
          {order.customer ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <LoyaltyRedemptionForm
                orderId={order.id}
                availablePoints={order.customer.loyaltyPoints}
                pointsRedeemed={order.loyaltyPointsRedeemed}
              />
            </div>
          ) : null}
        </MoreOptions>
      ) : order.customer ? (
        <p className="mt-4 text-sm text-ink-2">Customer: {order.customer.name}</p>
      ) : null}

      <div className="mt-4 ml-auto w-64 rounded-lg border border-line bg-surface p-4 text-sm">
        <div className="flex justify-between text-ink-2">
          <span>Subtotal</span>
          <span>₹{order.subtotal}</span>
        </div>
        <div className="flex justify-between text-ink-2">
          <span>Tax</span>
          <span>₹{order.taxTotal}</span>
        </div>
        {Number(order.discountAmount) > 0 ? (
          <div className="flex justify-between text-good">
            <span>Discount{order.promotion ? ` (${order.promotion.code})` : ""}</span>
            <span>-₹{order.discountAmount}</span>
          </div>
        ) : null}
        {Number(order.loyaltyDiscountAmount) > 0 ? (
          <div className="flex justify-between text-good">
            <span>Loyalty points ({order.loyaltyPointsRedeemed})</span>
            <span>-₹{order.loyaltyDiscountAmount}</span>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium text-ink">
          <span>Total</span>
          <span>₹{order.total}</span>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-ink">Payments</h2>
        {order.status === "OPEN" ? (
          <div className="mt-3 rounded-lg border border-line bg-surface p-4">
            <AddPaymentForm orderId={order.id} balanceDue={balanceDue} />
          </div>
        ) : null}
        <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">Method</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {order.payments.map((payment) => (
              <tr key={payment.id} className="border-t border-line">
                <td className="px-4 py-2 font-medium text-ink">{payment.method}</td>
                <td className="px-4 py-2 text-ink">₹{payment.amount}</td>
                <td className="px-4 py-2 text-ink-2">{payment.referenceNumber ?? "—"}</td>
              </tr>
            ))}
            {order.payments.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-3">
                  No payments recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
