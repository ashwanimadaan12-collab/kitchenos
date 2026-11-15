import { ms } from "./ms.util.js";

describe("ms", () => {
  it("parses minutes", () => {
    expect(ms("15m")).toBe(15 * 60_000);
  });

  it("parses days", () => {
    expect(ms("30d")).toBe(30 * 86_400_000);
  });

  it("parses seconds and milliseconds", () => {
    expect(ms("30s")).toBe(30_000);
    expect(ms("500ms")).toBe(500);
  });

  it("throws on an invalid duration string", () => {
    expect(() => ms("banana")).toThrow();
    expect(() => ms("15")).toThrow();
  });
});
