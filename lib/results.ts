import { Prisma, type SubscriptionStatus } from "@prisma/client";

import type { ProjectedCurvePoint } from "@/lib/assessment-engine";

export type SerializedAssessmentResult = {
  bmi: number;
  bmiCategory: string;
  dailyCalorieTarget: number | null;
  targetDate: string | null;
  projectedCurve: ProjectedCurvePoint[];
  summaryText: string | null;
};

type AssessmentResultRecord = {
  bmi: Prisma.Decimal;
  bmiCategory: string;
  dailyCalorieTarget: number | null;
  targetDate: Date | null;
  projectedCurve: Prisma.JsonValue | null;
  summaryText: string | null;
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeProjectedCurve(projectedCurve: Prisma.JsonValue | null): ProjectedCurvePoint[] {
  if (!Array.isArray(projectedCurve)) {
    return [];
  }

  return projectedCurve.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as { date?: unknown; weightKg?: unknown };

    if (typeof candidate.date !== "string" || typeof candidate.weightKg !== "number") {
      return [];
    }

    return [
      {
        date: candidate.date,
        weightKg: candidate.weightKg,
      },
    ];
  });
}

export function serializeAssessmentResult(
  result: AssessmentResultRecord,
): SerializedAssessmentResult {
  return {
    bmi: Number(result.bmi),
    bmiCategory: result.bmiCategory,
    dailyCalorieTarget: result.dailyCalorieTarget,
    targetDate: result.targetDate ? formatDate(result.targetDate) : null,
    projectedCurve: normalizeProjectedCurve(result.projectedCurve),
    summaryText: result.summaryText,
  };
}

export function buildResultsResponse(
  result: SerializedAssessmentResult,
  subscriptionStatus: SubscriptionStatus,
) {
  if (subscriptionStatus === "ACTIVE") {
    return {
      subscriptionStatus,
      paywall: {
        isLocked: false,
        message: null,
        lockedFields: [],
      },
      result,
    };
  }

  return {
    subscriptionStatus,
    paywall: {
      isLocked: true,
      message:
        "Unlock your full assessment to view your calorie target, timeline, and projected progress.",
      lockedFields: ["dailyCalorieTarget", "targetDate", "projectedCurve"],
    },
    result: {
      bmi: result.bmi,
      bmiCategory: result.bmiCategory,
      summaryText:
        result.summaryText ??
        "Your assessment is ready. Upgrade to unlock your calorie target and projected timeline.",
    },
  };
}
