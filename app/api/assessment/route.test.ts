import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  let sessionId: string | null = "sess_test";

  return {
    setSessionId(value: string | null) {
      sessionId = value;
    },
    cookies: vi.fn(async () => ({
      get: vi.fn((name: string) => {
        if (name !== "health_assessment_session" || !sessionId) {
          return undefined;
        }

        return { value: sessionId };
      }),
    })),
    userFindUnique: vi.fn(),
    queryRaw: vi.fn(),
    assessmentDraftUpsert: vi.fn(),
    prismaTransaction: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: mocked.cookies,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocked.userFindUnique,
    },
    $transaction: mocked.prismaTransaction,
  },
}));

import { GET, PATCH } from "@/app/api/assessment/route";

function patchRequest(payload: unknown) {
  return new Request("http://localhost:3000/api/assessment", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

describe("assessment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.setSessionId("sess_test");
    mocked.prismaTransaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: mocked.queryRaw,
        assessmentDraft: {
          upsert: mocked.assessmentDraftUpsert,
        },
      }),
    );
    mocked.queryRaw.mockResolvedValue([{ current_step: "goal" }]);
  });

  describe("GET /api/assessment", () => {
    it("restores the saved assessment progress for the current session", async () => {
      mocked.userFindUnique.mockResolvedValue({
        sessionId: "sess_test",
        assessmentDraft: {
          currentStep: "body-metrics",
          mainGoal: "LOSE_WEIGHT",
          gender: "FEMALE",
          age: 26,
          heightCm: 168,
          weightKg: new Prisma.Decimal(65),
          targetWeightKg: new Prisma.Decimal(60),
          exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
        },
      });

      const response = await GET(new Request("http://localhost:3000/api/assessment"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        sessionId: "sess_test",
        currentStep: "body-metrics",
        profile: {
          mainGoal: "LOSE_WEIGHT",
          gender: "FEMALE",
          age: 26,
          heightCm: 168,
          weightKg: 65,
          targetWeightKg: 60,
          exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
        },
      });
    });

    it("restores progress from an x-session-id header when no cookie is present", async () => {
      mocked.setSessionId(null);
      mocked.userFindUnique.mockResolvedValue({
        sessionId: "sess_header",
        assessmentDraft: {
          currentStep: "age",
          mainGoal: "LOSE_WEIGHT",
          gender: "FEMALE",
          age: 26,
          heightCm: null,
          weightKg: null,
          targetWeightKg: null,
          exerciseFrequency: null,
        },
      });

      const response = await GET(
        new Request("http://localhost:3000/api/assessment", {
          headers: {
            "x-session-id": "sess_header",
          },
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sessionId).toBe("sess_header");
      expect(body.currentStep).toBe("age");
      expect(mocked.userFindUnique).toHaveBeenCalledWith({
        where: { sessionId: "sess_header" },
        include: { assessmentDraft: true },
      });
    });
  });

  describe("PATCH /api/assessment validation", () => {
    it.each([
      {
        name: "age below the allowed range",
        payload: {
          step: "age",
          data: { age: 17 },
        },
        details: {
          age: "Please enter a realistic adult age.",
        },
      },
      {
        name: "age as a string instead of a number",
        payload: {
          step: "age",
          data: { age: "26" },
        },
        details: {
          age: "Invalid input: expected number, received string",
        },
      },
      {
        name: "height below the allowed range",
        payload: {
          step: "body-metrics",
          data: { heightCm: 99, weightKg: 65 },
        },
        details: {
          heightCm: "That height doesn't look right. Please check it.",
        },
      },
      {
        name: "negative height",
        payload: {
          step: "body-metrics",
          data: { heightCm: -1, weightKg: 65 },
        },
        details: {
          heightCm: "That height doesn't look right. Please check it.",
        },
      },
      {
        name: "weight above the allowed range",
        payload: {
          step: "body-metrics",
          data: { heightCm: 168, weightKg: 221 },
        },
        details: {
          weightKg: "That weight doesn't look realistic. Please check it.",
        },
      },
      {
        name: "target weight below the allowed range",
        payload: {
          step: "target-weight",
          data: { targetWeightKg: 29 },
        },
        details: {
          targetWeightKg: "That target weight doesn't look realistic. Please check it.",
        },
      },
    ])("returns 422 for $name", async ({ payload, details }) => {
      mocked.userFindUnique.mockResolvedValue({
        id: "user_1",
        assessmentDraft: {
          currentStep: "goal",
        },
      });

      const response = await PATCH(patchRequest(payload));
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input.",
          details,
        },
      });
      expect(mocked.prismaTransaction).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/assessment ordering", () => {
    it("does not move currentStep backward when an earlier step is submitted again", async () => {
      mocked.userFindUnique.mockResolvedValue({
        id: "user_1",
        assessmentDraft: {
          currentStep: "exercise-frequency",
        },
      });
      mocked.queryRaw.mockResolvedValue([{ current_step: "exercise-frequency" }]);
      mocked.assessmentDraftUpsert.mockResolvedValue({
        currentStep: "exercise-frequency",
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 26,
        heightCm: 168,
        weightKg: new Prisma.Decimal(65),
        targetWeightKg: new Prisma.Decimal(60),
        exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      });

      const response = await PATCH(
        patchRequest({
          step: "gender",
          data: {
            gender: "FEMALE",
          },
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(mocked.assessmentDraftUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_1" },
          create: expect.objectContaining({
            currentStep: "exercise-frequency",
          }),
          update: expect.objectContaining({
            currentStep: "exercise-frequency",
            gender: "FEMALE",
          }),
        }),
      );
      expect(body.currentStep).toBe("exercise-frequency");
    });

    it("accepts a duplicate submission of the same step without error", async () => {
      mocked.userFindUnique.mockResolvedValue({
        id: "user_1",
        assessmentDraft: {
          currentStep: "age",
        },
      });
      mocked.queryRaw.mockResolvedValue([{ current_step: "age" }]);
      mocked.assessmentDraftUpsert.mockResolvedValue({
        currentStep: "age",
        mainGoal: "LOSE_WEIGHT",
        gender: "FEMALE",
        age: 27,
        heightCm: null,
        weightKg: null,
        targetWeightKg: null,
        exerciseFrequency: null,
      });

      const response = await PATCH(
        patchRequest({
          step: "age",
          data: { age: 27 },
        }),
      );

      expect(response.status).toBe(200);
      expect(mocked.assessmentDraftUpsert).toHaveBeenCalledOnce();
    });
  });
});
