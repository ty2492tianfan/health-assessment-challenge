import { describe, expect, it } from "vitest";

import {
  firstAssessmentStep,
  getFurthestStep,
  getNextStep,
} from "@/lib/assessment";

describe("assessment step order", () => {
  it("starts on gender", () => {
    expect(firstAssessmentStep).toBe("gender");
  });

  it("advances to the next step and stops at review", () => {
    expect(getNextStep("gender")).toBe("goal");
    expect(getNextStep("exercise-frequency")).toBe("review");
    expect(getNextStep("review")).toBe("review");
  });

  it("keeps the furthest step when an earlier step is resubmitted", () => {
    expect(getFurthestStep("exercise-frequency", "gender")).toBe("exercise-frequency");
    expect(getFurthestStep("age", "body-metrics")).toBe("body-metrics");
    expect(getFurthestStep(undefined, "goal")).toBe("goal");
  });
});
