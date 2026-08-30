import { describe, expect, it } from "vitest";

import { buildResultsResponse } from "@/lib/results";

const fullResult = {
  bmi: 23.03,
  bmiCategory: "NORMAL",
  dailyCalorieTarget: 1537,
  targetDate: "2026-12-06",
  projectedCurve: [
    {
      date: "2026-09-06",
      weightKg: 64.64,
    },
  ],
  summaryText:
    "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
};

describe("buildResultsResponse", () => {
  it("returns a paywalled response for inactive subscribers", () => {
    const response = buildResultsResponse(fullResult, "INACTIVE");

    expect(response.subscriptionStatus).toBe("INACTIVE");
    expect(response.paywall).toEqual({
      isLocked: true,
      message:
        "Unlock your full assessment to view your calorie target, timeline, and projected progress.",
      lockedFields: ["dailyCalorieTarget", "targetDate", "projectedCurve"],
    });
    expect(response.result).toEqual({
      bmi: 23.03,
      bmiCategory: "NORMAL",
      summaryText: fullResult.summaryText,
    });
    expect("dailyCalorieTarget" in response.result).toBe(false);
    expect("targetDate" in response.result).toBe(false);
    expect("projectedCurve" in response.result).toBe(false);
  });

  it("returns the full result for active subscribers", () => {
    const response = buildResultsResponse(fullResult, "ACTIVE");

    expect(response.subscriptionStatus).toBe("ACTIVE");
    expect(response.paywall).toEqual({
      isLocked: false,
      message: null,
      lockedFields: [],
    });
    expect(response.result).toEqual(fullResult);
  });
});
