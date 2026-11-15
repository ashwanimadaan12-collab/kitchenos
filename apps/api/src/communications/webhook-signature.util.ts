import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` header: HMAC-SHA256 of the raw request body,
 * keyed by the WhatsApp app secret, as `sha256=<hex>`.
 */
export function verifyWhatsAppSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return timingSafeEqualStrings(expected, header);
}

/**
 * Verifies Twilio's `X-Twilio-Signature` header: base64(HMAC-SHA1(authToken, url + sorted
 * form params concatenated as key+value)), per Twilio's request-validation spec.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | undefined,
  authToken: string,
): boolean {
  if (!header) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return timingSafeEqualStrings(expected, header);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
