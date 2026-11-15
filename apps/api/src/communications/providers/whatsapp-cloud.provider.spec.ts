import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import { WhatsAppCloudProvider } from "./whatsapp-cloud.provider.js";
import { CommunicationProviderError } from "./communication-provider.js";

describe("WhatsAppCloudProvider", () => {
  let config: { get: jest.Mock };
  let provider: WhatsAppCloudProvider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new WhatsAppCloudProvider(config as unknown as ConfigService<Env, true>);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws without attempting a call when the access token or phone number id is missing", async () => {
    config.get.mockImplementation((key: string) => (key === "WHATSAPP_GRAPH_API_VERSION" ? "v20.0" : undefined));
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(provider.send({ to: "+911234567890", body: "hi", providerTemplateName: "order_ready" })).rejects.toThrow(
      CommunicationProviderError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when no providerTemplateName is given — WhatsApp only delivers approved templates", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "WHATSAPP_ACCESS_TOKEN") return "token";
      if (key === "WHATSAPP_PHONE_NUMBER_ID") return "phone_id";
      if (key === "WHATSAPP_GRAPH_API_VERSION") return "v20.0";
      return undefined;
    });

    await expect(provider.send({ to: "+911234567890", body: "hi" })).rejects.toThrow(CommunicationProviderError);
  });

  it("posts a template message to the Graph API and returns the provider message id", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "WHATSAPP_ACCESS_TOKEN") return "token";
      if (key === "WHATSAPP_PHONE_NUMBER_ID") return "phone_id";
      if (key === "WHATSAPP_GRAPH_API_VERSION") return "v20.0";
      return undefined;
    });
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.abc" }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await provider.send({ to: "+911234567890", body: "hi", providerTemplateName: "order_ready" });

    expect(result).toEqual({ providerMessageId: "wamid.abc" });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v20.0/phone_id/messages");
    expect(options.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(options.body)).toEqual(
      expect.objectContaining({ to: "+911234567890", template: { name: "order_ready", language: { code: "en" } } }),
    );
  });

  it("uses the per-template senderOverride instead of the default phone number id", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "WHATSAPP_ACCESS_TOKEN") return "token";
      if (key === "WHATSAPP_PHONE_NUMBER_ID") return "default_phone_id";
      if (key === "WHATSAPP_GRAPH_API_VERSION") return "v20.0";
      return undefined;
    });
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.1" }] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await provider.send({ to: "+911234567890", body: "hi", providerTemplateName: "order_ready", senderOverride: "brand_phone_id" });

    expect(fetchSpy.mock.calls[0][0]).toBe("https://graph.facebook.com/v20.0/brand_phone_id/messages");
  });

  it("throws with the provider's error message when the Graph API rejects the request", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "WHATSAPP_ACCESS_TOKEN") return "token";
      if (key === "WHATSAPP_PHONE_NUMBER_ID") return "phone_id";
      if (key === "WHATSAPP_GRAPH_API_VERSION") return "v20.0";
      return undefined;
    });
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Recipient phone number not in allowed list" } }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(provider.send({ to: "+911234567890", body: "hi", providerTemplateName: "order_ready" })).rejects.toThrow(
      "Recipient phone number not in allowed list",
    );
  });

  it("throws a clear error when the network call itself fails", async () => {
    config.get.mockImplementation((key: string) => {
      if (key === "WHATSAPP_ACCESS_TOKEN") return "token";
      if (key === "WHATSAPP_PHONE_NUMBER_ID") return "phone_id";
      if (key === "WHATSAPP_GRAPH_API_VERSION") return "v20.0";
      return undefined;
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    await expect(provider.send({ to: "+911234567890", body: "hi", providerTemplateName: "order_ready" })).rejects.toThrow(
      CommunicationProviderError,
    );
  });
});
