import { AutoPrint } from "../auto-print";
import { PrintButton } from "../print-button";
import { ThermalSheet, ThermalStyles, amount, paperFromSearch } from "../thermal";

/**
 * A printer test page with made-up data, so a counter can check paper width,
 * alignment and darkness before a real customer is waiting for a bill. Reachable
 * at /print/test?paper=80 or ?paper=58.
 *
 * The sample deliberately includes a long item name, a part payment and a
 * discount line — the three things that break a thermal layout first.
 */
const ITEMS = [
  { name: "Paneer Tikka Masala (Full plate)", qty: 2, rate: 260, gst: 5 },
  { name: "Butter Naan", qty: 4, rate: 45, gst: 5 },
  { name: "Veg Chowmein", qty: 1, rate: 140, gst: 5 },
  { name: "Cold Coffee with ice cream", qty: 2, rate: 150, gst: 5 },
  // Packaged water sits at a different rate, so the tax summary has to show
  // two bands — the case that breaks a single-rate bill layout.
  { name: "Packaged Water 1L", qty: 2, rate: 20, gst: 18 },
];

export default async function PrintTestPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string }>;
}) {
  const paper = paperFromSearch((await searchParams).paper);

  const subtotal = ITEMS.reduce((s, i) => s + i.qty * i.rate, 0);
  const bands = [5, 18]
    .map((ratePercent) => {
      const taxable = ITEMS.filter((i) => i.gst === ratePercent).reduce((s, i) => s + i.qty * i.rate, 0);
      return { ratePercent, taxable, tax: Math.round(taxable * ratePercent) / 100 };
    })
    .filter((b) => b.tax > 0);
  const gst = bands.reduce((s, b) => s + b.tax, 0);
  const discount = 50;
  const total = subtotal + gst - discount;
  const paidCash = 1300;
  const change = paidCash - total;
  const pieces = ITEMS.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <ThermalStyles paper={paper} />

      <ThermalSheet>
        <AutoPrint />
        <PrintButton paper={paper} />

        <div className="t-center">
          <p className="t-big t-bold" style={{ margin: 0 }}>
            TEST PRINT — {paper}mm
          </p>
          <p style={{ margin: "0.5mm 0 0" }}>Spice Route · Sector 18</p>
          <p className="t-wrap" style={{ margin: 0 }}>
            Shop 14, Atta Market, Noida
          </p>
          <p style={{ margin: 0 }}>GSTIN: 09AAACS1234F1ZQ</p>
          <p style={{ margin: 0 }}>FSSAI: 12345678901234</p>
          <p className="t-bold" style={{ margin: "1mm 0 0" }}>
            TAX INVOICE
          </p>
        </div>

        <div className="t-rule" />
        <div className="t-row">
          <span>Bill #0000</span>
          <span>Dine-in</span>
        </div>
        <div className="t-row">
          <span>24-11-26 08:00</span>
          <span>Table 7</span>
        </div>

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
            {ITEMS.map((item) => (
              <tr key={item.name}>
                <td style={{ paddingTop: "1mm" }}>{item.qty}</td>
                <td className="t-wrap" style={{ paddingTop: "1mm", paddingRight: "1.5mm" }}>
                  {item.name}
                  <br />
                  <span style={{ fontSize: "9.5px" }}>@ {amount(item.rate)}</span>
                </td>
                <td className="t-right" style={{ paddingTop: "1mm" }}>
                  {amount(item.qty * item.rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="t-rule" />
        <div className="t-row">
          <span>Items / pieces</span>
          <span>
            {ITEMS.length} / {pieces}
          </span>
        </div>
        <div className="t-row">
          <span>Subtotal</span>
          <span>{amount(subtotal)}</span>
        </div>
        <div className="t-row">
          <span>CGST</span>
          <span>{amount(gst / 2)}</span>
        </div>
        <div className="t-row">
          <span>SGST</span>
          <span>{amount(gst / 2)}</span>
        </div>
        <div className="t-row">
          <span>Discount (TEST50)</span>
          <span>-{amount(discount)}</span>
        </div>

        <div className="t-rule-solid" />
        <div className="t-row t-big t-bold">
          <span>TOTAL</span>
          <span>{amount(total)}</span>
        </div>
        <div className="t-rule-solid" />

        <div style={{ marginTop: "1mm" }}>
          <div className="t-row">
            <span>Cash</span>
            <span>{amount(paidCash)}</span>
          </div>
          <div className="t-row t-bold">
            <span>Change</span>
            <span>{amount(change)}</span>
          </div>
        </div>

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

        <div className="t-rule" />
        <p className="t-center" style={{ margin: "1mm 0 0" }}>
          Dhanyavaad! Phir aaiye
        </p>
        <p className="t-center" style={{ margin: 0, fontSize: "9.5px" }}>
          Amounts in INR
        </p>

        {/* Alignment aid: the bar should reach both edges of the paper with no
            clipping. If it is cut off, the paper width setting is wrong. */}
        <div style={{ marginTop: "3mm", borderTop: "2px solid #000" }} />
        <p className="t-center" style={{ margin: "0.5mm 0 0", fontSize: "9px" }}>
          Line above must touch both edges
        </p>

        <div className="t-rule-solid" style={{ marginTop: "4mm" }} />

        <div className="t-center">
          <p className="t-huge" style={{ margin: 0 }}>
            Table 7
          </p>
          <p className="t-big t-bold" style={{ margin: "0.5mm 0 0" }}>
            KOT · #0000
          </p>
        </div>
        <div className="t-rule-solid" />
        <table>
          <tbody>
            {ITEMS.map((item) => (
              <tr key={`kot-${item.name}`}>
                <td className="t-huge" style={{ width: "11mm", paddingBottom: "2mm" }}>
                  {item.qty}
                </td>
                <td className="t-big t-bold t-wrap" style={{ paddingBottom: "2mm" }}>
                  {item.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="t-rule" />
        <div className="t-row t-bold">
          <span>Total pieces</span>
          <span>{pieces}</span>
        </div>
      </ThermalSheet>
    </>
  );
}
