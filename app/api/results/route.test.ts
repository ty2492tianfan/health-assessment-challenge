import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getCurrentUserWithResult: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUserWithResult: mocked.getCurrentUserWithResult,
}));

import { GET } from "@/app/api/results/route";

describe("GET /api/results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the current session is missing or invalid", async () => {
    mocked.getCurrentUserWithResult.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost:3000/api/results"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid session.",
      },
    });
  });

  it("returns 404 when no assessment result exists yet", async () => {
    mocked.getCurrentUserWithResult.mockResolvedValue({
      subscriptionStatus: "INACTIVE",
      assessmentResult: null,
    });

    const response = await GET(new Request("http://localhost:3000/api/results"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: "RESULT_NOT_FOUND",
        message: "Assessment result was not found.",
      },
    });
  });

  it("returns a paywalled response for inactive subscribers", async () => {
    mocked.getCurrentUserWithResult.mockResolvedValue({
      subscriptionStatus: "INACTIVE",
      assessmentResult: {
        bmi: new Prisma.Decimal(23.03),
        bmiCategory: "NORMAL",
        dailyCalorieTarget: 1537,
        targetDate: new Date("2026-12-05T00:00:00.000Z"),
        projectedCurve: [
          {
            date: "2026-08-29",
            weightKg: 65,
          },
        ],
        summaryText:
          "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
      },
    });

    const response = await GET(new Request("http://localhost:3000/api/results"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      subscriptionStatus: "INACTIVE",
      paywall: {
        isLocked: true,
        message:
          "Unlock your full assessment to view your calorie target, timeline, and projected progress.",
        lockedFields: ["dailyCalorieTarget", "targetDate", "projectedCurve"],
      },
      result: {
        bmi: 23.03,
        bmiCategory: "NORMAL",
        summaryText:
          "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
      },
    });
  });

  it("returns the full result for active subscribers", async () => {
    mocked.getCurrentUserWithResult.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      assessmentResult: {
        bmi: new Prisma.Decimal(23.03),
        bmiCategory: "NORMAL",
        dailyCalorieTarget: 1537,
        targetDate: new Date("2026-12-05T00:00:00.000Z"),
        projectedCurve: [
          {
            date: "2026-08-29",
            weightKg: 65,
          },
        ],
        summaryText:
          "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
      },
    });

    const response = await GET(new Request("http://localhost:3000/api/results"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      subscriptionStatus: "ACTIVE",
      paywall: {
        isLocked: false,
        message: null,
        lockedFields: [],
      },
      result: {
        bmi: 23.03,
        bmiCategory: "NORMAL",
        dailyCalorieTarget: 1537,
        targetDate: "2026-12-05",
        projectedCurve: [
          {
            date: "2026-08-29",
            weightKg: 65,
          },
        ],
        summaryText:
          "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
      },
    });
  });
});
