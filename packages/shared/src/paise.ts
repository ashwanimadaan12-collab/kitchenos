/**
 * Money on the POS screen is held as whole paise, never as a float. A bill split three
 * ways in floating point leaves a stray 0.01 often enough that a cashier notices, and
 * "₹49.99 baaki" on a settled bill is the kind of thing that costs an owner's trust in
 * the software. Parsing and formatting both live here so the keypad, the split-payment
 * panel and anything that totals them all round the same way.
 */

/** Reads whatever a numeric keypad produced ("", "100", "99.5", "₹1,200") as paise. */
export function toPaise(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [whole = "", frac = ""] = cleaned.split(".");
  // A third decimal digit is a mis-tap, not a third of a paisa: it is dropped, not rounded,
  // so a stray keystroke can never quietly raise the amount the customer is charged.
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0").slice(0, 2) || "0");
}

/** Back to the two-decimal string the API's money schemas accept. */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Half of a bill, with the odd paisa going to the first half rather than vanishing. */
export function splitHalf(paise: number): { first: number; second: number } {
  const first = Math.ceil(paise / 2);
  return { first, second: paise - first };
}
