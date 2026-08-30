import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getCurrentUserWithDraft: vi.fn(),
  assessmentResultUpsert: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUserWithDraft: mocked.getCurrentUserWithDraft,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assessmentResult: {
      upsert: mocked.assessmentResultUpsert,
    },
  },
}));

import { POST } from "@/app/api/assessment/complete/route";

const storedResult = {
  id: "result_1",
  bmi: new Prisma.Decimal(23.03),
  bmiCategory: "NORMAL",
  dailyCalorieTarget: 1537,
  targetDate: new Date("2026-12-06T00:00:00.000Z"),
  projectedCurve: [
    {
      date: "2026-08-30",
      weightKg: 65,
    },
  ],
  summaryText:
    "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
};

describe("POST /api/assessment/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 when the assessment draft is incomplete", async () => {
    mocked.getCurrentUserWithDraft.mockResolvedValue({
      id: "user_1",
      subscriptionStatus: "INACTIVE",
      assessmentDraft: {
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 26,
        heightCm: 168,
        weightKg: null,
        targetWeightKg: null,
        exerciseFrequency: null,
      },
    });

    const response = await POST(new Request("http://localhost:3000/api/assessment/complete", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: {
        code: "INCOMPLETE_ASSESSMENT",
        message: "Assessment data is incomplete.",
        missingFields: ["weightKg", "targetWeightKg", "exerciseFrequency"],
      },
    });
    expect(mocked.assessmentResultUpsert).not.toHaveBeenCalled();
  });

  it("returns 422 when stored draft values are out of range", async () => {
    mocked.getCurrentUserWithDraft.mockResolvedValue({
      id: "user_1",
      subscriptionStatus: "INACTIVE",
      assessmentDraft: {
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 12,
        heightCm: 168,
        weightKg: new Prisma.Decimal(65),
        targetWeightKg: new Prisma.Decimal(60),
        exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      },
    });

    const response = await POST(new Request("http://localhost:3000/api/assessment/complete", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("INVALID_ASSESSMENT_INPUT");
    expect(mocked.assessmentResultUpsert).not.toHaveBeenCalled();
  });

  it("persists the result but returns a paywalled payload for inactive subscribers", async () => {
    mocked.getCurrentUserWithDraft.mockResolvedValue({
      id: "user_1",
      subscriptionStatus: "INACTIVE",
      assessmentDraft: {
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 26,
        heightCm: 168,
        weightKg: new Prisma.Decimal(65),
        targetWeightKg: new Prisma.Decimal(60),
        exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      },
    });

    mocked.assessmentResultUpsert.mockResolvedValue(storedResult);

    const response = await POST(new Request("http://localhost:3000/api/assessment/complete", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocked.assessmentResultUpsert).toHaveBeenCalledOnce();
    expect(body.success).toBe(true);
    expect(body.resultId).toBe("result_1");
    expect(body.subscriptionStatus).toBe("INACTIVE");
    expect(body.paywall.isLocked).toBe(true);
    expect(body.result).toEqual({
      bmi: 23.03,
      bmiCategory: "NORMAL",
      summaryText: storedResult.summaryText,
    });
    expect(body.result).not.toHaveProperty("dailyCalorieTarget");
    expect(body.result).not.toHaveProperty("targetDate");
    expect(body.result).not.toHaveProperty("projectedCurve");
  });

  it("returns the full result for active subscribers", async () => {
    mocked.getCurrentUserWithDraft.mockResolvedValue({
      id: "user_1",
      subscriptionStatus: "ACTIVE",
      assessmentDraft: {
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 26,
        heightCm: 168,
        weightKg: new Prisma.Decimal(65),
        targetWeightKg: new Prisma.Decimal(60),
        exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      },
    });

    mocked.assessmentResultUpsert.mockResolvedValue(storedResult);

    const response = await POST(new Request("http://localhost:3000/api/assessment/complete", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscriptionStatus).toBe("ACTIVE");
    expect(body.result.dailyCalorieTarget).toBe(1537);
    expect(body.result.projectedCurve).toEqual(storedResult.projectedCurve);
  });
});
