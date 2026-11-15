import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import { SmsTwilioProvider } from "./sms-twilio.provider.js";
import { CommunicationProviderError } from "./communication-provider.js";

describe("SmsTwilioProvider", () => {
  let config: { get: jest.Mock };
  let provider: SmsTwilioProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new SmsTwilioProvider(config as unknown as ConfigService<Env, true>);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws without attempting a call when Twilio credentials are missing", async () => {
    config.get.mockReturnValue(undefined);
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(provider.send({ to: "+911234567890", body: "hi" })).rejects.toThrow(CommunicationProviderError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to Twilio's REST API with Basic auth and returns the message sid", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "SMS_TWILIO_ACCOUNT_SID") return "AC123";
      if (key === "SMS_TWILIO_AUTH_TOKEN") return "secret";
      if (key === "SMS_TWILIO_FROM_NUMBER") return "+15551234567";
      return undefined;
    });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM123" }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await provider.send({ to: "+911234567890", body: "hi" });

    expect(result).toEqual({ providerMessageId: "SM123" });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(options.body.toString()).toContain("To=%2B911234567890");
  });

  it("uses the per-template senderOverride instead of the default from number", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "SMS_TWILIO_ACCOUNT_SID") return "AC123";
      if (key === "SMS_TWILIO_AUTH_TOKEN") return "secret";
      if (key === "SMS_TWILIO_FROM_NUMBER") return "+15550000000";
      return undefined;
    });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM1" }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await provider.send({ to: "+911234567890", body: "hi", senderOverride: "+15559998888" });

    expect(fetchSpy.mock.calls[0][1].body.toString()).toContain("From=%2B15559998888");
  });

  it("throws with Twilio's error message when the API rejects the request", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "SMS_TWILIO_ACCOUNT_SID") return "AC123";
      if (key === "SMS_TWILIO_AUTH_TOKEN") return "secret";
      if (key === "SMS_TWILIO_FROM_NUMBER") return "+15551234567";
      return undefined;
    });
    const fetchSpy = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "The 'To' number is not a valid phone number" }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(provider.send({ to: "not-a-number", body: "hi" })).rejects.toThrow(
      "The 'To' number is not a valid phone number",
    );
  });
});
