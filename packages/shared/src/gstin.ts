/**
 * GSTIN and FSSAI: cleaning up what someone typed, and checking it is real.
 *
 * A shape check alone is not enough. "09AAACS1234F1Z5" has all 15 characters in
 * the right places and is still not a GSTIN — its last character does not match
 * the other fourteen. Printing a wrong GSTIN on every bill is the kind of
 * mistake nobody notices until a customer or an officer does, so the number is
 * checked properly before it can be saved.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Shape: 2 state digits, 10-char PAN, entity digit, a literal Z, check char. */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** People type GSTINs off a certificate, in groups and in lower case. */
export function normalizeGstin(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function normalizeFssai(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/**
 * The 15th character, worked out from the first fourteen: each character's
 * position in the 36-character set, multiplied by 1 or 2 by turns, with the
 * tens and units of each product added separately, then subtracted from 36.
 * Catches a single mistyped character almost every time.
 */
export function gstinCheckDigit(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = CHARSET.indexOf(first14[i]!);
    if (value < 0) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36] ?? null;
}

export function isValidGstin(candidate: string): boolean {
  const value = normalizeGstin(candidate);
  if (!GSTIN_SHAPE.test(value)) return false;
  return gstinCheckDigit(value.slice(0, 14)) === value[14];
}

export function isValidFssai(candidate: string): boolean {
  return /^[0-9]{14}$/.test(normalizeFssai(candidate));
}

/** First two digits of a GSTIN are the state's code. Shown back to the person
 *  so a number pasted from the wrong outlet's certificate stands out. */
const STATE_BY_CODE: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

export function gstinState(candidate: string): string | null {
  return STATE_BY_CODE[normalizeGstin(candidate).slice(0, 2)] ?? null;
}
