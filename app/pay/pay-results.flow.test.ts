import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: {
    id: "user_1",
    subscriptionStatus: "INACTIVE" as "INACTIVE" | "ACTIVE",
    assessmentResult: {
      bmi: 23.03,
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
    },
  },
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: state.user.id })),
  getCurrentUserWithResult: vi.fn(async () => state.user),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        user: {
          update: async () => {
            state.user.subscriptionStatus = "ACTIVE";
            return { subscriptionStatus: "ACTIVE" };
          },
        },
        paymentEvent: {
          create: async () => ({ id: "pay_evt_1" }),
        },
      }),
    ),
  },
}));

import { POST as pay } from "@/app/pay/route";
import { GET as getResults } from "@/app/api/results/route";

describe("pay callback then results access", () => {
  beforeEach(() => {
    state.user.subscriptionStatus = "INACTIVE";
  });

  it("switches the results payload from masked to full after /pay", async () => {
    const lockedResponse = await getResults(new Request("http://localhost:3000/api/results"));
    const lockedBody = await lockedResponse.json();

    expect(lockedResponse.status).toBe(200);
    expect(lockedBody.subscriptionStatus).toBe("INACTIVE");
    expect(lockedBody.result).not.toHaveProperty("dailyCalorieTarget");
    expect(lockedBody.result).not.toHaveProperty("targetDate");
    expect(lockedBody.result).not.toHaveProperty("projectedCurve");

    const payResponse = await pay(
      new Request("http://localhost:3000/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "mock",
          plan: "monthly",
        }),
      }),
    );
    const payBody = await payResponse.json();

    expect(payResponse.status).toBe(200);
    expect(payBody.subscriptionStatus).toBe("ACTIVE");

    const unlockedResponse = await getResults(new Request("http://localhost:3000/api/results"));
    const unlockedBody = await unlockedResponse.json();

    expect(unlockedResponse.status).toBe(200);
    expect(unlockedBody.subscriptionStatus).toBe("ACTIVE");
    expect(unlockedBody.result.dailyCalorieTarget).toBe(1537);
    expect(unlockedBody.result.targetDate).toBe("2026-12-06");
    expect(unlockedBody.result.projectedCurve).toEqual([
      {
        date: "2026-08-30",
        weightKg: 65,
      },
    ]);
  });
});
