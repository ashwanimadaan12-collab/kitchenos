import {
  FULFILLMENT_STAGES,
  fulfillmentAction,
  fulfillmentLabel,
  isForwardStage,
  nextStage,
  stageAppliesTo,
  stagesFor,
  type FulfillmentStage,
} from "@kitchenos/shared";

describe("fulfillment ladder", () => {
  it("walks a delivery order through the rider leg", () => {
    expect(stagesFor("DELIVERY")).toEqual(["PLACED", "COOKING", "READY", "PICKED_UP", "COMPLETED"]);
    expect(nextStage("PLACED", "DELIVERY")).toBe("COOKING");
    expect(nextStage("COOKING", "DELIVERY")).toBe("READY");
    expect(nextStage("READY", "DELIVERY")).toBe("PICKED_UP");
    expect(nextStage("PICKED_UP", "DELIVERY")).toBe("COMPLETED");
    expect(nextStage("COMPLETED", "DELIVERY")).toBeNull();
  });

  it("skips the rider leg for dine-in and takeaway", () => {
    for (const channel of ["DINE_IN", "TAKEAWAY"] as const) {
      expect(stagesFor(channel)).toEqual(["PLACED", "COOKING", "READY", "COMPLETED"]);
      expect(nextStage("READY", channel)).toBe("COMPLETED");
      expect(stageAppliesTo("PICKED_UP", channel)).toBe(false);
    }
    expect(stageAppliesTo("PICKED_UP", "DELIVERY")).toBe(true);
  });

  it("never runs backwards, and never sideways onto the same stage", () => {
    expect(isForwardStage("READY", "COOKING")).toBe(false);
    expect(isForwardStage("COMPLETED", "PLACED")).toBe(false);
    expect(isForwardStage("READY", "READY")).toBe(false);
    expect(isForwardStage("PLACED", "COMPLETED")).toBe(true);
  });

  it("finds the next stage even for an order sitting on a stage its channel skips", () => {
    // A delivery order downgraded to takeaway after the rider took it: PICKED_UP is not in
    // the takeaway ladder, so indexOf misses and the fallback has to kick in.
    expect(nextStage("PICKED_UP", "TAKEAWAY")).toBe("COMPLETED");
  });

  it("labels every stage in every channel, with no gaps", () => {
    for (const channel of ["DINE_IN", "TAKEAWAY", "DELIVERY"] as const) {
      for (const stage of FULFILLMENT_STAGES) {
        expect(fulfillmentLabel(stage as FulfillmentStage, channel)).toBeTruthy();
        expect(fulfillmentAction(stage as FulfillmentStage, channel)).toBeTruthy();
      }
    }
  });

  it("reads differently per channel where it matters to the cashier", () => {
    expect(fulfillmentLabel("COMPLETED", "DELIVERY")).toBe("Deliver ho gaya");
    expect(fulfillmentLabel("COMPLETED", "TAKEAWAY")).toBe("Customer ko de diya");
    expect(fulfillmentLabel("COMPLETED", "DINE_IN")).toBe("Table par laga diya");
    expect(fulfillmentAction("PICKED_UP", "DELIVERY")).toBe("Rider ko diya");
  });
});
