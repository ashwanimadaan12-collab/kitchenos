import { createHmac } from "node:crypto";
import { verifyTwilioSignature, verifyWhatsAppSignature } from "./webhook-signature.util.js";

describe("verifyWhatsAppSignature", () => {
  const appSecret = "app_secret_123";
  const rawBody = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [] } }] }] });

  it("accepts a correctly computed X-Hub-Signature-256 header", () => {
    const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    expect(verifyWhatsAppSignature(rawBody, signature, appSecret)).toBe(true);
  });

  it("rejects a tampered body even if the header looks well-formed", () => {
    const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    expect(verifyWhatsAppSignature(rawBody + "tampered", signature, appSecret)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyWhatsAppSignature(rawBody, undefined, appSecret)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = `sha256=${createHmac("sha256", "wrong_secret").update(rawBody).digest("hex")}`;
    expect(verifyWhatsAppSignature(rawBody, signature, appSecret)).toBe(false);
  });
});

describe("verifyTwilioSignature", () => {
  const authToken = "auth_token_123";
  const url = "https://api.kitchenos.test/v1/communications/webhooks/sms";
  const params = { MessageSid: "SM123", MessageStatus: "delivered" };

  function sign(targetUrl: string, targetParams: Record<string, string>): string {
    const data = Object.keys(targetParams)
      .sort()
      .reduce((acc, key) => acc + key + targetParams[key], targetUrl);
    return createHmac("sha1", authToken).update(data).digest("base64");
  }

  it("accepts a correctly computed X-Twilio-Signature header", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params), authToken)).toBe(true);
  });

  it("rejects when a param was tampered with after signing", () => {
    const signature = sign(url, params);
    expect(verifyTwilioSignature(url, { ...params, MessageStatus: "failed" }, signature, authToken)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyTwilioSignature(url, params, undefined, authToken)).toBe(false);
  });

  it("rejects a signature computed for a different URL", () => {
    const signature = sign("https://evil.example.com/webhook", params);
    expect(verifyTwilioSignature(url, params, signature, authToken)).toBe(false);
  });
});
