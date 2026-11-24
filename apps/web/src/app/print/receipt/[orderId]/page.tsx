import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AutoPrint } from "../../auto-print";
import { PrintButton } from "../../print-button";
import { ThermalSheet, ThermalStyles, amount, paperFromSearch } from "../../thermal";

interface OrderItem {
  id: string;
  productName: string;
  variantName: string;
  unitPrice: string;
  quantity: number;
  taxRatePercent: string;
  lineSubtotal: string;
  taxAmount: string;
  lineTotal: string;
  status: "ACTIVE" | "VOIDED";
}

interface Payment {
  id: string;
  method: string;
  amount: string;
}

interface OrderDetail {
  orderNumber: number;
  channel: string;
  status: string;
  subtotal: string;
  taxTotal: string;
  discountAmount: string;
  loyaltyDiscountAmount: string;
  total: string;
  createdAt: string;
  organization: { name: string; legalName: string | null };
  outlet: {
    name: string;
    address: string | null;
    city: string | null;
    gstin: string | null;
    fssaiLicence: string | null;
    brand: { name: string };
  };
  table: { name: string } | null;
  items: OrderItem[];
  payments: Payment[];
  customer: { name: string } | null;
  promotion: { code: string } | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Parcel",
  DELIVERY: "Delivery",
};

interface TaxBand {
  ratePercent: number;
  taxable: number;
  tax: number;
}

/**
 * A tax invoice has to show tax rate by rate, not as one lump: a bill with food
 * at 5% and a packaged drink at 18% needs both lines. Each order line already
 * carries the rate it was billed at, so the bands come from the lines rather
 * than from a setting that may have changed since.
 *
 * A restaurant serves where it stands, so the supply is always intra-state and
 * the tax splits half to CGST and half to SGST.
 */
function taxBands(items: OrderItem[]): TaxBand[] {
  const byRate = new Map<number, TaxBand>();
  for (const item of items) {
    const ratePercent = Number(item.taxRatePercent) || 0;
    const band = byRate.get(ratePercent) ?? { ratePercent, taxable: 0, tax: 0 };
    band.taxable += Number(item.lineSubtotal) || 0;
    band.tax += Number(item.taxAmount) || 0;
    byRate.set(ratePercent, band);
  }
  return [...byRate.values()].filter((b) => b.tax > 0).sort((a, b) => a.ratePercent - b.ratePercent);
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  WALLET: "Wallet",
};

/**
 * Deliberately not under the (admin) route group — no sidebar/header, just the bill — so printing
 * it doesn't also print the whole app chrome. The auth middleware still protects this path like
 * any other (its matcher only exempts the PWA/offline plumbing), so this is never reachable
 * without a session.
 *
 * Every item keeps its name and its money in the same table: the two used to live in
 * two separate tables, which printed all the names first and then all the amounts,
 * so nothing on a customer's bill lined up with what it cost.
 */
export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paper?: string }>;
}) {
  const [{ orderId }, { paper: paperParam }] = await Promise.all([params, searchParams]);
  const paper = paperFromSearch(paperParam);

  const res = await apiFetch(`/v1/orders/${orderId}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load order");
  const order: OrderDetail = await res.json();
  const activeItems = order.items.filter((i) => i.status === "ACTIVE");
  const totalPieces = activeItems.reduce((sum, i) => sum + i.quantity, 0);
  const bands = taxBands(activeItems);
  // Without a GSTIN the business is not registered, so calling the paper a tax
  // invoice would be a false claim: it prints as a plain receipt instead.
  const isTaxInvoice = Boolean(order.outlet.gstin) && bands.length > 0;
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = Number(order.total) - paid;
  const placedAt = new Date(order.createdAt);

  return (
    <>
      <ThermalStyles paper={paper} />
      <ThermalSheet>
        <AutoPrint />
        <PrintButton paper={paper} />

        <div className="t-center">
          <p className="t-big t-bold" style={{ margin: 0 }}>
            {order.outlet.brand?.name ?? order.outlet.name}
          </p>
          {order.organization?.legalName ? (
            <p className="t-wrap" style={{ margin: "0.5mm 0 0", fontSize: "9.5px" }}>
              {order.organization.legalName}
            </p>
          ) : null}
          <p style={{ margin: "0.5mm 0 0" }}>{order.outlet.name}</p>
          {order.outlet.address ? (
            <p className="t-wrap" style={{ margin: 0 }}>
              {order.outlet.address}
              {order.outlet.city ? `, ${order.outlet.city}` : ""}
            </p>
          ) : null}
          {order.outlet.gstin ? <p style={{ margin: 0 }}>GSTIN: {order.outlet.gstin}</p> : null}
          {order.outlet.fssaiLicence ? (
            <p style={{ margin: 0 }}>FSSAI: {order.outlet.fssaiLicence}</p>
          ) : null}
          <p className="t-bold" style={{ margin: "1mm 0 0" }}>
            {isTaxInvoice ? "TAX INVOICE" : "RECEIPT"}
          </p>
        </div>

        <div className="t-rule" />

        <div className="t-row">
          <span>{isTaxInvoice ? "Invoice" : "Bill"} #{order.orderNumber}</span>
          <span>{CHANNEL_LABEL[order.channel] ?? order.channel}</span>
        </div>
        <div className="t-row">
          <span>
            {placedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" })}{" "}
            {placedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {order.table ? <span>{order.table.name}</span> : null}
        </div>
        {order.customer ? <div style={{ marginTop: "0.5mm" }}>{order.customer.name}</div> : null}

        <div className="t-rule" />

        <table>
          <thead>
            <tr>
              <td className="t-bold" style={{ width: "8mm" }}>
                Qty
              </td>
              <td className="t-bold">Item</td>
              <td className="t-bold t-right" style={{ width: "16mm" }}>
                Amount
              </td>
            </tr>
          </thead>
          <tbody>
            {activeItems.map((item) => (
              <tr key={item.id}>
                <td style={{ paddingTop: "1mm" }}>{item.quantity}</td>
                <td className="t-wrap" style={{ paddingTop: "1mm", paddingRight: "1.5mm" }}>
                  {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ""}
                  <br />
                  <span style={{ fontSize: "9.5px" }}>@ {amount(item.unitPrice)}</span>
                </td>
                <td className="t-right" style={{ paddingTop: "1mm" }}>
                  {amount(item.lineTotal)}
                </td>
              </tr>
            ))}
            {activeItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="t-center">
                  Koi item nahi
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="t-rule" />

        <div className="t-row">
          <span>Items / pieces</span>
          <span>
            {activeItems.length} / {totalPieces}
          </span>
        </div>
        <div className="t-row">
          <span>Subtotal</span>
          <span>{amount(order.subtotal)}</span>
        </div>
        {bands.length > 0 ? (
          <>
            <div className="t-row">
              <span>CGST</span>
              <span>{amount(Number(order.taxTotal) / 2)}</span>
            </div>
            <div className="t-row">
              <span>SGST</span>
              <span>{amount(Number(order.taxTotal) / 2)}</span>
            </div>
          </>
        ) : null}
        {Number(order.discountAmount) > 0 ? (
          <div className="t-row">
            <span>Discount{order.promotion ? ` (${order.promotion.code})` : ""}</span>
            <span>-{amount(order.discountAmount)}</span>
          </div>
        ) : null}
        {Number(order.loyaltyDiscountAmount) > 0 ? (
          <div className="t-row">
            <span>Loyalty points</span>
            <span>-{amount(order.loyaltyDiscountAmount)}</span>
          </div>
        ) : null}

        <div className="t-rule-solid" />
        <div className="t-row t-big t-bold">
          <span>TOTAL</span>
          <span>{amount(order.total)}</span>
        </div>
        <div className="t-rule-solid" />

        {order.payments.length > 0 ? (
          <div style={{ marginTop: "1mm" }}>
            {order.payments.map((p) => (
              <div key={p.id} className="t-row">
                <span>{PAYMENT_LABEL[p.method] ?? p.method}</span>
                <span>{amount(p.amount)}</span>
              </div>
            ))}
            {/* A part-paid bill must say so on the paper, or the counter has no
                record of what is still owed once the customer walks off. */}
            {balance > 0.009 ? (
              <div className="t-row t-bold">
                <span>Balance due</span>
                <span>{amount(balance)}</span>
              </div>
            ) : null}
            {balance < -0.009 ? (
              <div className="t-row t-bold">
                <span>Change</span>
                <span>{amount(-balance)}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="t-row t-bold" style={{ marginTop: "1mm" }}>
            <span>UNPAID</span>
            <span>{amount(order.total)}</span>
          </div>
        )}

        {isTaxInvoice ? (
          <>
            <div className="t-rule" />
            <table>
              <thead>
                <tr>
                  <td className="t-bold">Rate</td>
                  <td className="t-bold t-right">Taxable</td>
                  <td className="t-bold t-right">CGST</td>
                  <td className="t-bold t-right">SGST</td>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.ratePercent}>
                    <td>{b.ratePercent}%</td>
                    <td className="t-right">{amount(b.taxable)}</td>
                    <td className="t-right">{amount(b.tax / 2)}</td>
                    <td className="t-right">{amount(b.tax / 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <div className="t-rule" />
        <p className="t-center" style={{ margin: "1mm 0 0" }}>
          Dhanyavaad! Phir aaiye
        </p>
        <p className="t-center" style={{ margin: 0, fontSize: "9.5px" }}>
          Amounts in INR
        </p>
      </ThermalSheet>
    </>
  );
}
