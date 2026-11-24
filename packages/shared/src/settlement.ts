/**
 * Reading a Zomato or Swiggy settlement report and working out what the
 * restaurant actually earned.
 *
 * The platforms change their export columns, and the two do not agree with each
 * other, so nothing here assumes a fixed layout: a report is a list of rows
 * with headers, and a mapping says which header plays which role. The mapping
 * is guessed from the headers and then corrected by the person once; the maths
 * below is the same whatever the file looked like.
 */

/** What a column in the uploaded file means. */
export type ColumnRole =
  | "externalOrderId"
  | "orderedAt"
  | "grossSales"
  | "restaurantDiscount"
  | "commission"
  | "platformFees"
  | "taxesWithheld"
  | "otherAdjustments"
  | "netPayout";

export const COLUMN_ROLE_LABEL: Record<ColumnRole, string> = {
  externalOrderId: "Order ID",
  orderedAt: "Order ki date",
  grossSales: "Gross sale (customer ne jitna diya)",
  restaurantDiscount: "Discount (aapne diya)",
  commission: "Commission",
  platformFees: "Platform / delivery / gateway fees",
  taxesWithheld: "TCS / TDS kaata gaya",
  otherAdjustments: "Baaki adjustment (penalty, credit)",
  netPayout: "Net payout (bank me aaya)",
};

/** Roles that are money taken out of the gross. Reports disagree on whether
 *  these carry a minus sign, so their magnitude is what counts. */
const DEDUCTION_ROLES: ColumnRole[] = [
  "restaurantDiscount",
  "commission",
  "platformFees",
  "taxesWithheld",
];

export type ColumnMapping = Partial<Record<ColumnRole, string>>;

/**
 * Header words each role is recognised by, lower-cased and stripped of
 * punctuation. Longer, more specific phrases are listed first so "commission
 * gst" does not match the plain "gst" rule meant for withheld tax.
 */
const ROLE_HINTS: { role: ColumnRole; patterns: string[] }[] = [
  { role: "externalOrderId", patterns: ["order id", "orderid", "order no", "order number"] },
  { role: "orderedAt", patterns: ["order date", "ordered on", "order placed", "date"] },
  {
    role: "netPayout",
    patterns: ["net payout", "payout", "net amount", "net settlement", "amount payable", "settlement value"],
  },
  {
    role: "grossSales",
    patterns: ["gross", "subtotal", "item total", "order total", "food value", "net bill value", "order value"],
  },
  {
    role: "restaurantDiscount",
    patterns: [
      "restaurant discount",
      "merchant discount",
      "discount by restaurant",
      "restaurant funded",
      "promo by restaurant",
      "discount",
    ],
  },
  {
    role: "commission",
    patterns: ["commission", "platform commission", "service fee", "aggregator fee"],
  },
  {
    role: "platformFees",
    patterns: [
      "payment mechanism fee",
      "payment gateway",
      "delivery fee",
      "delivery charge",
      "collection fee",
      "logistics",
      "platform fee",
      "fees",
    ],
  },
  { role: "taxesWithheld", patterns: ["tcs", "tds", "tax collected", "tax deducted", "withheld"] },
  {
    role: "otherAdjustments",
    patterns: ["adjustment", "penalty", "cancellation", "credit note", "other"],
  },
];

function canonical(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * First guess at which column is which. Each role takes the first unclaimed
 * header that mentions it, so a file with both "Commission" and "Commission
 * GST" does not map them to the same role.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<string>();

  for (const { role, patterns } of ROLE_HINTS) {
    for (const pattern of patterns) {
      const hit = headers.find((h) => !taken.has(h) && canonical(h).includes(pattern));
      if (hit) {
        mapping[role] = hit;
        taken.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/**
 * A number out of a spreadsheet cell. Handles what these exports actually
 * contain: rupee signs, thousands commas, blanks, dashes for zero, and
 * accounting negatives written as (1,234.50).
 */
export function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (raw === null || raw === undefined) return 0;

  let text = String(raw).trim();
  if (text === "" || text === "-" || text === "—" || text === "NA" || text === "N/A") return 0;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[₹$,\s]/g, "");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

export interface SettlementRow {
  externalOrderId: string;
  orderedAt: string | null;
  grossSales: number;
  restaurantDiscount: number;
  commission: number;
  platformFees: number;
  taxesWithheld: number;
  otherAdjustments: number;
  /** What the report says reached the bank, when the file carries that column. */
  reportedNetPayout: number | null;
}

export type RawRow = Record<string, unknown>;

export function mapRows(rows: RawRow[], mapping: ColumnMapping): SettlementRow[] {
  const num = (row: RawRow, role: ColumnRole): number => {
    const column = mapping[role];
    if (!column) return 0;
    const value = parseAmount(row[column]);
    return DEDUCTION_ROLES.includes(role) ? Math.abs(value) : value;
  };

  return rows.map((row) => {
    const payoutColumn = mapping.netPayout;
    return {
      externalOrderId: mapping.externalOrderId ? String(row[mapping.externalOrderId] ?? "").trim() : "",
      orderedAt: mapping.orderedAt ? String(row[mapping.orderedAt] ?? "").trim() || null : null,
      grossSales: num(row, "grossSales"),
      restaurantDiscount: num(row, "restaurantDiscount"),
      commission: num(row, "commission"),
      platformFees: num(row, "platformFees"),
      taxesWithheld: num(row, "taxesWithheld"),
      // Signed: an adjustment can be a penalty or a credit back.
      otherAdjustments: num(row, "otherAdjustments"),
      reportedNetPayout: payoutColumn ? parseAmount(row[payoutColumn]) : null,
    };
  });
}

export interface SettlementSummary {
  orderCount: number;
  grossSales: number;
  restaurantDiscount: number;
  commission: number;
  platformFees: number;
  taxesWithheld: number;
  otherAdjustments: number;
  totalDeductions: number;
  /** Gross minus every deduction — what the report ought to pay out. */
  calculatedNetPayout: number;
  /** The payout column's total, when the file had one. */
  reportedNetPayout: number | null;
  /** reported − calculated. Away from zero means the file does not add up. */
  difference: number | null;
  /** Share of gross that the platform kept, deductions and taxes included. */
  effectiveCommissionPercent: number;
  /** Share of gross that actually reached the bank. */
  payoutPercent: number;
  averageOrderValue: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function summarise(rows: SettlementRow[]): SettlementSummary {
  const sum = (pick: (r: SettlementRow) => number) => rows.reduce((t, r) => t + pick(r), 0);

  const grossSales = sum((r) => r.grossSales);
  const restaurantDiscount = sum((r) => r.restaurantDiscount);
  const commission = sum((r) => r.commission);
  const platformFees = sum((r) => r.platformFees);
  const taxesWithheld = sum((r) => r.taxesWithheld);
  const otherAdjustments = sum((r) => r.otherAdjustments);

  // otherAdjustments is signed, so a credit reduces what was deducted.
  const totalDeductions = restaurantDiscount + commission + platformFees + taxesWithheld - otherAdjustments;
  const calculatedNetPayout = grossSales - totalDeductions;

  const anyReported = rows.some((r) => r.reportedNetPayout !== null);
  const reportedNetPayout = anyReported ? sum((r) => r.reportedNetPayout ?? 0) : null;

  return {
    orderCount: rows.length,
    grossSales: round2(grossSales),
    restaurantDiscount: round2(restaurantDiscount),
    commission: round2(commission),
    platformFees: round2(platformFees),
    taxesWithheld: round2(taxesWithheld),
    otherAdjustments: round2(otherAdjustments),
    totalDeductions: round2(totalDeductions),
    calculatedNetPayout: round2(calculatedNetPayout),
    reportedNetPayout: reportedNetPayout === null ? null : round2(reportedNetPayout),
    difference: reportedNetPayout === null ? null : round2(reportedNetPayout - calculatedNetPayout),
    effectiveCommissionPercent: grossSales > 0 ? round2((totalDeductions / grossSales) * 100) : 0,
    payoutPercent: grossSales > 0 ? round2((calculatedNetPayout / grossSales) * 100) : 0,
    averageOrderValue: rows.length > 0 ? round2(grossSales / rows.length) : 0,
  };
}

/** Rupees a row is worth keeping an eye on: a payout that disagrees with the
 *  row's own numbers by more than a rupee is a row to query with the platform. */
export function rowsThatDoNotAddUp(rows: SettlementRow[], tolerance = 1): SettlementRow[] {
  return rows.filter((r) => {
    if (r.reportedNetPayout === null) return false;
    const calculated =
      r.grossSales - r.restaurantDiscount - r.commission - r.platformFees - r.taxesWithheld + r.otherAdjustments;
    return Math.abs(r.reportedNetPayout - calculated) > tolerance;
  });
}
