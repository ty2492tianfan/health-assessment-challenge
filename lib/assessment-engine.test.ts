import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assessmentValidationCopy } from "@/lib/assessment-constraints";
import {
  AssessmentCalculationError,
  calculateAssessmentResult,
  getBmiCategory,
  prepareAssessmentInput,
} from "@/lib/assessment-engine";

const validDraft = {
  mainGoal: "LOSE_WEIGHT" as const,
  gender: "FEMALE" as const,
  age: 26,
  heightCm: 168,
  weightKg: new Prisma.Decimal(65),
  targetWeightKg: new Prisma.Decimal(60),
  exerciseFrequency: "SEVERAL_TIMES_A_WEEK" as const,
};

const validInput = {
  mainGoal: "LOSE_WEIGHT" as const,
  gender: "FEMALE" as const,
  age: 26,
  heightCm: 168,
  weightKg: 65,
  targetWeightKg: 60,
  exerciseFrequency: "SEVERAL_TIMES_A_WEEK" as const,
};

describe("prepareAssessmentInput", () => {
  it("reports missing required fields from an incomplete draft", () => {
    const preparedInput = prepareAssessmentInput({
      ...validDraft,
      weightKg: null,
      targetWeightKg: null,
      exerciseFrequency: null,
    });

    expect(preparedInput).toEqual({
      ok: false,
      code: "INCOMPLETE_ASSESSMENT",
      missingFields: ["weightKg", "targetWeightKg", "exerciseFrequency"],
    });
  });

  it("rejects an invalid target weight for weight loss", () => {
    const preparedInput = prepareAssessmentInput({
      ...validDraft,
      targetWeightKg: new Prisma.Decimal(65),
    });

    expect(preparedInput).toEqual({
      ok: false,
      code: "INVALID_TARGET_WEIGHT",
      message: assessmentValidationCopy.weightLossTarget,
    });
  });

  it.each([
    {
      name: "age below the allowed range",
      draft: { age: 17 },
      field: "age",
      message: assessmentValidationCopy.age,
    },
    {
      name: "age above the allowed range",
      draft: { age: 81 },
      field: "age",
      message: assessmentValidationCopy.age,
    },
    {
      name: "height below the allowed range",
      draft: { heightCm: 99 },
      field: "heightCm",
      message: assessmentValidationCopy.height,
    },
    {
      name: "height above the allowed range",
      draft: { heightCm: 251 },
      field: "heightCm",
      message: assessmentValidationCopy.height,
    },
    {
      name: "weight below the allowed range",
      draft: { weightKg: new Prisma.Decimal(29) },
      field: "weightKg",
      message: assessmentValidationCopy.weight,
    },
    {
      name: "weight above the allowed range",
      draft: { weightKg: new Prisma.Decimal(221) },
      field: "weightKg",
      message: assessmentValidationCopy.weight,
    },
    {
      name: "target weight below the allowed range",
      draft: { targetWeightKg: new Prisma.Decimal(29) },
      field: "targetWeightKg",
      message: assessmentValidationCopy.targetWeight,
    },
  ])("rejects $name", ({ draft, field, message }) => {
    const preparedInput = prepareAssessmentInput({
      ...validDraft,
      ...draft,
    });

    expect(preparedInput).toEqual({
      ok: false,
      code: "INVALID_ASSESSMENT_INPUT",
      field,
      message,
    });
  });

  it("rejects a non-finite stored weight", () => {
    const preparedInput = prepareAssessmentInput({
      ...validDraft,
      weightKg: Number.NaN as unknown as Prisma.Decimal,
    });

    expect(preparedInput).toEqual({
      ok: false,
      code: "INVALID_ASSESSMENT_INPUT",
      field: "weightKg",
      message: assessmentValidationCopy.weight,
    });
  });
});

describe("calculateAssessmentResult", () => {
  it("calculates BMI, calorie target, and target date from the core Day 1 inputs", () => {
    const result = calculateAssessmentResult(validInput, {
      now: new Date("2026-08-30T00:00:00.000Z"),
    });

    expect(result.bmi).toBe(23.03);
    expect(result.bmiCategory).toBe("NORMAL");
    expect(result.dailyCalorieTarget).toBe(1537);
    expect(result.targetDate.toISOString().slice(0, 10)).toBe("2026-12-06");
    expect(result.projectedCurve[0]).toEqual({
      date: "2026-08-30",
      weightKg: 65,
    });
    expect(result.projectedCurve.at(-1)).toEqual({
      date: "2026-12-06",
      weightKg: 60,
    });
  });

  it("maps BMI values into readable categories, including exact boundaries", () => {
    expect(getBmiCategory(18.49)).toBe("UNDERWEIGHT");
    expect(getBmiCategory(18.5)).toBe("NORMAL");
    expect(getBmiCategory(24.99)).toBe("NORMAL");
    expect(getBmiCategory(25)).toBe("OVERWEIGHT");
    expect(getBmiCategory(29.99)).toBe("OVERWEIGHT");
    expect(getBmiCategory(30)).toBe("OBESE");
  });

  it("uses the female calorie floor for a low-energy maintenance case", () => {
    const result = calculateAssessmentResult({
      mainGoal: "MAINTAIN_AND_GET_FIT",
      gender: "FEMALE",
      age: 80,
      heightCm: 150,
      weightKg: 40,
      targetWeightKg: 40,
      exerciseFrequency: "NEVER",
    });

    expect(result.dailyCalorieTarget).toBe(1200);
    expect(result.projectedCurve).toEqual([
      {
        date: result.projectedCurve[0]?.date,
        weightKg: 40,
      },
    ]);
  });

  it("uses the male calorie floor for a low-energy case", () => {
    const result = calculateAssessmentResult({
      mainGoal: "MAINTAIN_AND_GET_FIT",
      gender: "MALE",
      age: 80,
      heightCm: 150,
      weightKg: 40,
      targetWeightKg: 40,
      exerciseFrequency: "NEVER",
    });

    expect(result.dailyCalorieTarget).toBe(1500);
  });

  it.each([
    {
      name: "illegal age",
      input: { age: 12 },
      field: "age",
    },
    {
      name: "zero height",
      input: { heightCm: 0 },
      field: "heightCm",
    },
    {
      name: "negative weight",
      input: { weightKg: -10 },
      field: "weightKg",
    },
    {
      name: "unrealistic target weight",
      input: { targetWeightKg: 5 },
      field: "targetWeightKg",
    },
  ])("throws for $name before producing a result", ({ input, field }) => {
    expect(() =>
      calculateAssessmentResult({
        ...validInput,
        ...input,
      }),
    ).toThrow(AssessmentCalculationError);

    try {
      calculateAssessmentResult({
        ...validInput,
        ...input,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AssessmentCalculationError);
      expect((error as AssessmentCalculationError).field).toBe(field);
    }
  });
});
