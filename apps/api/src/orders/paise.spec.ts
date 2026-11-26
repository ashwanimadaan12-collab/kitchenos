import { paiseToRupees, splitHalf, toPaise } from "@kitchenos/shared";

describe("paise", () => {
  it("reads what a keypad produces", () => {
    expect(toPaise("")).toBe(0);
    expect(toPaise("100")).toBe(10_000);
    expect(toPaise("99.5")).toBe(9_950);
    expect(toPaise("99.50")).toBe(9_950);
    expect(toPaise("0.05")).toBe(5);
    expect(toPaise(".5")).toBe(50);
    expect(toPaise("1,200")).toBe(120_000);
    expect(toPaise("₹147.00")).toBe(14_700);
  });

  it("drops a third decimal rather than rounding the customer up", () => {
    expect(toPaise("10.999")).toBe(1_099);
    expect(toPaise("10.996")).toBe(1_099);
  });

  it("round-trips through the string form the API accepts", () => {
    for (const paise of [0, 1, 50, 9_950, 14_700, 120_000]) {
      expect(toPaise(paiseToRupees(paise))).toBe(paise);
      expect(paiseToRupees(paise)).toMatch(/^\d{1,10}(\.\d{2})?$/);
    }
  });

  it("splits a bill without losing or inventing a paisa", () => {
    for (const total of [0, 1, 14_700, 14_701, 99_999]) {
      const { first, second } = splitHalf(total);
      expect(first + second).toBe(total);
      expect(second).toBeLessThanOrEqual(first);
    }
    expect(splitHalf(14_701)).toEqual({ first: 7_351, second: 7_350 });
  });

  it("never produces a negative or fractional paisa amount", () => {
    expect(toPaise("-50")).toBe(5_000);
    expect(Number.isInteger(toPaise("33.33"))).toBe(true);
  });
});
