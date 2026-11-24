import type { ReactNode } from "react";

export type PaperWidth = "80" | "58";

/** Printable width inside the roll: a thermal head leaves a margin either side,
 *  so an 80mm roll prints about 72mm and a 58mm roll about 48mm. */
const PRINTABLE_MM: Record<PaperWidth, number> = { "80": 72, "58": 48 };

export function paperFromSearch(value: string | undefined): PaperWidth {
  return value === "58" ? "58" : "80";
}

/**
 * Thermal geometry lives in real CSS, not utility classes, because the paper
 * size has to reach the `@page` rule. Without it the browser lays the ticket
 * out on its default A4 sheet and the printer either scales it down to a
 * stamp in the corner or spits out a mostly blank page per bill.
 */
export function ThermalStyles({ paper }: { paper: PaperWidth }) {
  const mm = PRINTABLE_MM[paper];
  const css = `
    @page { size: ${paper}mm auto; margin: 0; }

    .thermal {
      width: ${mm}mm;
      margin: 0 auto;
      padding: 2mm 0;
      background: #fff;
      color: #000;
      font-family: ui-monospace, "DejaVu Sans Mono", "Courier New", monospace;
      font-size: ${paper === "58" ? "10.5px" : "12px"};
      line-height: 1.35;
      /* Thermal paper is white and the head only burns black — never let a
         browser's dark mode or "economy" colour handling touch it. */
      color-scheme: light;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .thermal * { box-sizing: border-box; }
    .thermal table { width: 100%; border-collapse: collapse; }
    .thermal td { vertical-align: top; padding: 0; }
    .t-center { text-align: center; }
    .t-right { text-align: right; }
    .t-bold { font-weight: 700; }
    .t-big { font-size: ${paper === "58" ? "13px" : "15px"}; }
    .t-huge { font-size: ${paper === "58" ? "16px" : "19px"}; font-weight: 700; }
    .t-rule { border-top: 1px dashed #000; margin: 1.5mm 0; }
    .t-rule-solid { border-top: 1px solid #000; margin: 1.5mm 0; }
    .t-row { display: flex; justify-content: space-between; gap: 2mm; }
    .t-wrap { overflow-wrap: anywhere; }

    @media screen {
      body { background: #e9e9ec; }
      .thermal {
        margin: 16px auto;
        padding: 4mm 3mm;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
      }
    }
    @media print {
      .no-print { display: none !important; }
      html, body { background: #fff; margin: 0; padding: 0; }
    }
  `;
  return <style>{css}</style>;
}

export function ThermalSheet({ children }: { children: ReactNode }) {
  return <div className="thermal">{children}</div>;
}

/** Rupees with two decimals and no symbol — the column header says the unit, and
 *  a glyph the printer's font may not carry prints as a blank or a box. */
export function amount(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
