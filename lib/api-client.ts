import type { ProjectedCurvePoint } from "@/lib/assessment-engine";
import type { AssessmentStep } from "@/lib/assessment";

export type MainGoal = "LOSE_WEIGHT" | "MAINTAIN_AND_GET_FIT";
export type Gender = "FEMALE" | "MALE";
export type ExerciseFrequency =
  | "ALMOST_EVERY_DAY"
  | "SEVERAL_TIMES_A_WEEK"
  | "SEVERAL_TIMES_A_MONTH"
  | "NEVER";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE";

export type AssessmentProfile = {
  mainGoal: MainGoal | null;
  gender: Gender | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  exerciseFrequency: ExerciseFrequency | null;
};

export type AssessmentRestoreResponse = {
  sessionId: string;
  currentStep: AssessmentStep;
  profile: AssessmentProfile | null;
};

export type AssessmentPatchResponse = {
  success: true;
  currentStep: AssessmentStep;
  profile: AssessmentProfile;
};

export type CompletionResponse = {
  success: true;
  resultId: string;
} & ResultsResponse;

export type ResultsResponse = {
  subscriptionStatus: SubscriptionStatus;
  paywall: {
    isLocked: boolean;
    message: string | null;
    lockedFields: string[];
  };
  result: {
    bmi: number;
    bmiCategory: string;
    dailyCalorieTarget?: number | null;
    targetDate?: string | null;
    projectedCurve?: ProjectedCurvePoint[];
    summaryText: string | null;
  };
};

export type SessionResponse = {
  sessionId: string;
  subscriptionStatus: SubscriptionStatus;
};

export type PayResponse = {
  success: true;
  subscriptionStatus: SubscriptionStatus;
  paymentEventId: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string>;
  missingFields?: string[];

  constructor({
    status,
    message,
    code,
    details,
    missingFields,
  }: {
    status: number;
    message: string;
    code?: string;
    details?: Record<string, string>;
    missingFields?: string[];
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.missingFields = missingFields;
  }
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response
    .json()
    .catch(() => null as { error?: { message?: string; code?: string } } | null);

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      message: payload?.error?.message ?? "Request failed.",
      code: payload?.error?.code,
      details:
        payload && typeof payload === "object" && "error" in payload
          ? (payload.error as { details?: Record<string, string> }).details
          : undefined,
      missingFields:
        payload && typeof payload === "object" && "error" in payload
          ? (payload.error as { missingFields?: string[] }).missingFields
          : undefined,
    });
  }

  return payload as T;
}

export function createSession() {
  return requestJson<SessionResponse>("/api/sessions", {
    method: "POST",
  });
}

export function getAssessment() {
  return requestJson<AssessmentRestoreResponse>("/api/assessment");
}

export function saveAssessmentStep(step: AssessmentStep, data: unknown) {
  return requestJson<AssessmentPatchResponse>("/api/assessment", {
    method: "PATCH",
    body: JSON.stringify({ step, data }),
  });
}

export function completeAssessment() {
  return requestJson<CompletionResponse>("/api/assessment/complete", {
    method: "POST",
  });
}

export function getResults() {
  return requestJson<ResultsResponse>("/api/results");
}

export function activateSubscription(payload: {
  provider: string;
  plan?: string;
  externalRef?: string;
}) {
  return requestJson<PayResponse>("/pay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
