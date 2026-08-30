import { type AssessmentDraft, type ExerciseFrequency, type Gender, type MainGoal } from "@prisma/client";

import {
  assessmentConstraints,
  assessmentValidationCopy,
} from "@/lib/assessment-constraints";

export type BmiCategory = "UNDERWEIGHT" | "NORMAL" | "OVERWEIGHT" | "OBESE";

export type AssessmentInput = {
  mainGoal: MainGoal;
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  exerciseFrequency: ExerciseFrequency;
};

export type ProjectedCurvePoint = {
  date: string;
  weightKg: number;
};

export type CalculatedAssessmentResult = {
  bmi: number;
  bmiCategory: BmiCategory;
  dailyCalorieTarget: number;
  targetDate: Date;
  projectedCurve: ProjectedCurvePoint[];
  summaryText: string;
};

export type AssessmentDraftField =
  | "mainGoal"
  | "gender"
  | "age"
  | "heightCm"
  | "weightKg"
  | "targetWeightKg"
  | "exerciseFrequency";

type AssessmentDraftForCalculation = Pick<
  AssessmentDraft,
  | "mainGoal"
  | "gender"
  | "age"
  | "heightCm"
  | "weightKg"
  | "targetWeightKg"
  | "exerciseFrequency"
>;

export class AssessmentCalculationError extends Error {
  readonly code = "INVALID_ASSESSMENT_INPUT";

  constructor(
    readonly field: AssessmentDraftField,
    message: string,
  ) {
    super(message);
    this.name = "AssessmentCalculationError";
  }
}

type PrepareAssessmentInputResult =
  | {
      ok: true;
      input: AssessmentInput;
    }
  | {
      ok: false;
      code: "INCOMPLETE_ASSESSMENT";
      missingFields: AssessmentDraftField[];
    }
  | {
      ok: false;
      code: "INVALID_TARGET_WEIGHT";
      message: string;
    }
  | {
      ok: false;
      code: "INVALID_ASSESSMENT_INPUT";
      field: AssessmentDraftField;
      message: string;
    };

const activityMultipliers: Record<ExerciseFrequency, number> = {
  ALMOST_EVERY_DAY: 1.55,
  SEVERAL_TIMES_A_WEEK: 1.375,
  SEVERAL_TIMES_A_MONTH: 1.2,
  NEVER: 1.1,
};

const bmrAdjustments: Record<Gender, number> = {
  FEMALE: -161,
  MALE: 5,
};

const requiredDraftFields: AssessmentDraftField[] = [
  "mainGoal",
  "gender",
  "age",
  "heightCm",
  "weightKg",
  "targetWeightKg",
  "exerciseFrequency",
];

function roundToTwoDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getTargetDeficitCalories(input: AssessmentInput) {
  if (input.mainGoal === "LOSE_WEIGHT") {
    return 400;
  }

  return input.targetWeightKg < input.weightKg ? 150 : 0;
}

function getMinimumCalorieTarget(gender: Gender) {
  return gender === "MALE" ? 1500 : 1200;
}

function getWeeklyWeightChangeKg({
  estimatedTdee,
  dailyCalorieTarget,
}: {
  estimatedTdee: number;
  dailyCalorieTarget: number;
}) {
  const dailyDeficit = Math.max(estimatedTdee - dailyCalorieTarget, 0);
  return dailyDeficit > 0 ? (dailyDeficit * 7) / 7700 : 0;
}

function buildProjectedCurve({
  startDate,
  currentWeightKg,
  targetWeightKg,
  weeklyWeightChangeKg,
  weeksNeeded,
}: {
  startDate: Date;
  currentWeightKg: number;
  targetWeightKg: number;
  weeklyWeightChangeKg: number;
  weeksNeeded: number;
}) {
  if (weeksNeeded === 0 || weeklyWeightChangeKg <= 0) {
    return [
      {
        date: formatUtcDate(startDate),
        weightKg: roundToTwoDecimals(currentWeightKg),
      },
    ];
  }

  const intervalWeeks = Math.max(1, Math.ceil(weeksNeeded / 10));
  const curve: ProjectedCurvePoint[] = [
    {
      date: formatUtcDate(startDate),
      weightKg: roundToTwoDecimals(currentWeightKg),
    },
  ];

  for (let week = intervalWeeks; week < weeksNeeded; week += intervalWeeks) {
    const projectedWeight = Math.max(
      currentWeightKg - weeklyWeightChangeKg * week,
      targetWeightKg,
    );

    curve.push({
      date: formatUtcDate(addUtcDays(startDate, week * 7)),
      weightKg: roundToTwoDecimals(projectedWeight),
    });
  }

  curve.push({
    date: formatUtcDate(addUtcDays(startDate, weeksNeeded * 7)),
    weightKg: roundToTwoDecimals(targetWeightKg),
  });

  return curve;
}

function buildSummaryText({
  mainGoal,
  bmiCategory,
}: {
  mainGoal: MainGoal;
  bmiCategory: BmiCategory;
}) {
  const bmiSummary = {
    UNDERWEIGHT: "Your BMI is currently below the typical healthy range.",
    NORMAL: "Your BMI is currently within the normal range.",
    OVERWEIGHT: "Your BMI is currently above the normal range.",
    OBESE: "Your BMI is currently in the obesity range.",
  } satisfies Record<BmiCategory, string>;

  const goalSummary =
    mainGoal === "LOSE_WEIGHT"
      ? "A moderate calorie deficit can help you work toward your goal at a steady pace."
      : "A balanced calorie target can help you maintain your weight while improving overall fitness.";

  return `${bmiSummary[bmiCategory]} ${goalSummary}`;
}

export function getBmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) {
    return "UNDERWEIGHT";
  }

  if (bmi < 25) {
    return "NORMAL";
  }

  if (bmi < 30) {
    return "OVERWEIGHT";
  }

  return "OBESE";
}

export function getMissingAssessmentFields(
  draft: AssessmentDraftForCalculation,
): AssessmentDraftField[] {
  return requiredDraftFields.filter((field) => draft[field] == null);
}

export function assertAssessmentInput(input: AssessmentInput) {
  if (
    !Number.isInteger(input.age) ||
    input.age < assessmentConstraints.age.min ||
    input.age > assessmentConstraints.age.max
  ) {
    throw new AssessmentCalculationError("age", assessmentValidationCopy.age);
  }

  if (
    !Number.isInteger(input.heightCm) ||
    input.heightCm < assessmentConstraints.heightCm.min ||
    input.heightCm > assessmentConstraints.heightCm.max
  ) {
    throw new AssessmentCalculationError("heightCm", assessmentValidationCopy.height);
  }

  if (
    !Number.isFinite(input.weightKg) ||
    input.weightKg < assessmentConstraints.weightKg.min ||
    input.weightKg > assessmentConstraints.weightKg.max
  ) {
    throw new AssessmentCalculationError("weightKg", assessmentValidationCopy.weight);
  }

  if (
    !Number.isFinite(input.targetWeightKg) ||
    input.targetWeightKg < assessmentConstraints.weightKg.min ||
    input.targetWeightKg > assessmentConstraints.weightKg.max
  ) {
    throw new AssessmentCalculationError(
      "targetWeightKg",
      assessmentValidationCopy.targetWeight,
    );
  }

  if (input.mainGoal === "LOSE_WEIGHT" && input.targetWeightKg >= input.weightKg) {
    throw new AssessmentCalculationError(
      "targetWeightKg",
      assessmentValidationCopy.weightLossTarget,
    );
  }
}

export function prepareAssessmentInput(
  draft: AssessmentDraftForCalculation,
): PrepareAssessmentInputResult {
  const missingFields = getMissingAssessmentFields(draft);

  if (missingFields.length > 0) {
    return {
      ok: false,
      code: "INCOMPLETE_ASSESSMENT",
      missingFields,
    };
  }

  const input: AssessmentInput = {
    mainGoal: draft.mainGoal!,
    gender: draft.gender!,
    age: draft.age!,
    heightCm: draft.heightCm!,
    weightKg: Number(draft.weightKg),
    targetWeightKg: Number(draft.targetWeightKg),
    exerciseFrequency: draft.exerciseFrequency!,
  };

  try {
    assertAssessmentInput(input);
  } catch (error) {
    if (error instanceof AssessmentCalculationError) {
      if (
        error.field === "targetWeightKg" &&
        input.mainGoal === "LOSE_WEIGHT" &&
        input.targetWeightKg >= input.weightKg
      ) {
        return {
          ok: false,
          code: "INVALID_TARGET_WEIGHT",
          message: error.message,
        };
      }

      return {
        ok: false,
        code: "INVALID_ASSESSMENT_INPUT",
        field: error.field,
        message: error.message,
      };
    }

    throw error;
  }

  return {
    ok: true,
    input,
  };
}

export function calculateAssessmentResult(
  input: AssessmentInput,
  options?: {
    now?: Date;
  },
): CalculatedAssessmentResult {
  assertAssessmentInput(input);

  const baseDate = startOfUtcDay(options?.now ?? new Date());
  const heightMeters = input.heightCm / 100;
  const bmi = roundToTwoDecimals(input.weightKg / (heightMeters * heightMeters));
  const bmiCategory = getBmiCategory(bmi);
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    bmrAdjustments[input.gender];
  const estimatedTdee = bmr * activityMultipliers[input.exerciseFrequency];
  const targetDeficitCalories = getTargetDeficitCalories(input);
  const dailyCalorieTarget = Math.max(
    getMinimumCalorieTarget(input.gender),
    Math.round(estimatedTdee - targetDeficitCalories),
  );
  const weeklyWeightChangeKg = getWeeklyWeightChangeKg({
    estimatedTdee,
    dailyCalorieTarget,
  });
  const remainingWeightGapKg = Math.max(input.weightKg - input.targetWeightKg, 0);
  const weeksNeeded =
    weeklyWeightChangeKg > 0 && remainingWeightGapKg > 0
      ? Math.ceil(remainingWeightGapKg / weeklyWeightChangeKg)
      : 0;
  const targetDate = addUtcDays(baseDate, weeksNeeded * 7);

  return {
    bmi,
    bmiCategory,
    dailyCalorieTarget,
    targetDate,
    projectedCurve: buildProjectedCurve({
      startDate: baseDate,
      currentWeightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg,
      weeklyWeightChangeKg,
      weeksNeeded,
    }),
    summaryText: buildSummaryText({
      mainGoal: input.mainGoal,
      bmiCategory,
    }),
  };
}
