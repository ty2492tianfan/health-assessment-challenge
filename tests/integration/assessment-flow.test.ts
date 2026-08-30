import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_PREFIX = "sess_itest_";

const mocked = vi.hoisted(() => {
  let sessionId: string | null = null;

  return {
    setSessionId(value: string | null) {
      sessionId = value;
    },
    cookies: vi.fn(async () => ({
      get: (name: string) => {
        if (name !== "health_assessment_session" || !sessionId) {
          return undefined;
        }

        return { value: sessionId };
      },
    })),
  };
});

vi.mock("next/headers", () => ({
  cookies: mocked.cookies,
}));

import { GET, PATCH } from "@/app/api/assessment/route";
import { POST as completeAssessment } from "@/app/api/assessment/complete/route";
import { GET as getResults } from "@/app/api/results/route";
import { POST as pay } from "@/app/pay/route";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIntegration = hasDatabase ? describe : describe.skip;

async function createTestSession() {
  const sessionId = `${TEST_PREFIX}${randomUUID().replace(/-/g, "")}`;

  await prisma.user.create({
    data: {
      sessionId,
      assessmentDraft: {
        create: {},
      },
    },
  });

  mocked.setSessionId(sessionId);
  return sessionId;
}

function patchRequest(step: string, data: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/assessment", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ step, data }),
  });
}

async function saveCompleteDraft() {
  await PATCH(patchRequest("gender", { gender: "FEMALE" }));
  await PATCH(patchRequest("goal", { mainGoal: "LOSE_WEIGHT" }));
  await PATCH(patchRequest("age", { age: 26 }));
  await PATCH(
    patchRequest("body-metrics", {
      heightCm: 168,
      weightKg: 65,
    }),
  );
  await PATCH(patchRequest("target-weight", { targetWeightKg: 60 }));
  await PATCH(
    patchRequest("exercise-frequency", {
      exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
    }),
  );
}

describeIntegration("assessment persistence integration", () => {
  beforeEach(async () => {
    mocked.setSessionId(null);
    await prisma.user.deleteMany({
      where: {
        sessionId: {
          startsWith: TEST_PREFIX,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        sessionId: {
          startsWith: TEST_PREFIX,
        },
      },
    });
    await prisma.$disconnect();
  });

  it("restores in-progress answers after an interruption", async () => {
    await createTestSession();

    const firstSave = await PATCH(patchRequest("gender", { gender: "FEMALE" }));
    expect(firstSave.status).toBe(200);

    const secondSave = await PATCH(patchRequest("goal", { mainGoal: "LOSE_WEIGHT" }));
    expect(secondSave.status).toBe(200);

    const restored = await GET(new Request("http://localhost:3000/api/assessment"));
    const body = await restored.json();

    expect(restored.status).toBe(200);
    expect(body.currentStep).toBe("age");
    expect(body.profile).toMatchObject({
      gender: "FEMALE",
      mainGoal: "LOSE_WEIGHT",
      age: null,
    });
  });

  it("keeps later progress when an earlier step is repeated or submitted out of order", async () => {
    await createTestSession();

    await PATCH(patchRequest("gender", { gender: "FEMALE" }));
    await PATCH(patchRequest("goal", { mainGoal: "LOSE_WEIGHT" }));
    await PATCH(patchRequest("age", { age: 26 }));

    const outOfOrder = await PATCH(patchRequest("gender", { gender: "MALE" }));
    const duplicate = await PATCH(patchRequest("age", { age: 29 }));
    const skippedAhead = await PATCH(
      patchRequest("target-weight", { targetWeightKg: 58 }),
    );

    expect(outOfOrder.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(skippedAhead.status).toBe(200);

    const restored = await GET(new Request("http://localhost:3000/api/assessment"));
    const body = await restored.json();

    expect(body.currentStep).toBe("exercise-frequency");
    expect(body.profile).toMatchObject({
      gender: "MALE",
      mainGoal: "LOSE_WEIGHT",
      age: 29,
      targetWeightKg: 58,
    });
  });

  it("persists concurrent step updates without losing fields or rolling currentStep backward", async () => {
    await createTestSession();
    await PATCH(patchRequest("gender", { gender: "FEMALE" }));
    await PATCH(patchRequest("goal", { mainGoal: "LOSE_WEIGHT" }));

    const [ageResponse, metricsResponse] = await Promise.all([
      PATCH(patchRequest("age", { age: 32 })),
      PATCH(
        patchRequest("body-metrics", {
          heightCm: 170,
          weightKg: 68,
        }),
      ),
    ]);

    expect(ageResponse.status).toBe(200);
    expect(metricsResponse.status).toBe(200);

    const restored = await GET(new Request("http://localhost:3000/api/assessment"));
    const body = await restored.json();

    expect(body.profile).toMatchObject({
      gender: "FEMALE",
      mainGoal: "LOSE_WEIGHT",
      age: 32,
      heightCm: 170,
      weightKg: 68,
    });
    expect(body.currentStep).toBe("target-weight");
  });

  it("unlocks the protected result fields after the mock payment callback", async () => {
    const sessionId = await createTestSession();
    await saveCompleteDraft();

    const completeResponse = await completeAssessment(
      new Request("http://localhost:3000/api/assessment/complete", {
        method: "POST",
      }),
    );
    const completeBody = await completeResponse.json();

    expect(completeResponse.status).toBe(200);
    expect(completeBody.result).not.toHaveProperty("projectedCurve");
    expect(completeBody.result).not.toHaveProperty("dailyCalorieTarget");
    expect(completeBody.result).not.toHaveProperty("targetDate");

    const lockedResponse = await getResults(
      new Request(`http://localhost:3000/api/results?sessionId=${sessionId}`),
    );
    const lockedBody = await lockedResponse.json();

    expect(lockedResponse.status).toBe(200);
    expect(lockedBody.subscriptionStatus).toBe("INACTIVE");
    expect(lockedBody.result).not.toHaveProperty("projectedCurve");

    const payResponse = await pay(
      new Request("http://localhost:3000/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          provider: "mock",
          plan: "monthly",
        }),
      }),
    );

    expect(payResponse.status).toBe(200);

    const unlockedResponse = await getResults(
      new Request("http://localhost:3000/api/results", {
        headers: {
          "x-session-id": sessionId,
        },
      }),
    );
    const unlockedBody = await unlockedResponse.json();

    expect(unlockedBody.subscriptionStatus).toBe("ACTIVE");
    expect(unlockedBody.result.dailyCalorieTarget).toEqual(expect.any(Number));
    expect(unlockedBody.result.targetDate).toEqual(expect.any(String));
    expect(unlockedBody.result.projectedCurve.length).toBeGreaterThan(0);
  });
});
