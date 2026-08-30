import { z } from "zod";

import { assessmentSteps, type AssessmentStep } from "@/lib/assessment";
import {
  assessmentConstraints,
  assessmentValidationCopy,
} from "@/lib/assessment-constraints";

const mainGoalSchema = z.enum(["LOSE_WEIGHT", "MAINTAIN_AND_GET_FIT"]);
const genderSchema = z.enum(["FEMALE", "MALE"]);
const exerciseFrequencySchema = z.enum([
  "ALMOST_EVERY_DAY",
  "SEVERAL_TIMES_A_WEEK",
  "SEVERAL_TIMES_A_MONTH",
  "NEVER",
]);

const stepSchema = z.enum(assessmentSteps);
const ageSchema = z
  .number()
  .int()
  .min(assessmentConstraints.age.min, assessmentValidationCopy.age)
  .max(assessmentConstraints.age.max, assessmentValidationCopy.age);
const heightSchema = z
  .number()
  .int()
  .min(assessmentConstraints.heightCm.min, assessmentValidationCopy.height)
  .max(assessmentConstraints.heightCm.max, assessmentValidationCopy.height);
const weightSchema = z
  .number()
  .positive(assessmentValidationCopy.weight)
  .min(assessmentConstraints.weightKg.min, assessmentValidationCopy.weight)
  .max(assessmentConstraints.weightKg.max, assessmentValidationCopy.weight);
const targetWeightSchema = z
  .number()
  .positive(assessmentValidationCopy.targetWeight)
  .min(assessmentConstraints.weightKg.min, assessmentValidationCopy.targetWeight)
  .max(assessmentConstraints.weightKg.max, assessmentValidationCopy.targetWeight);

const patchPayloadSchemas = {
  goal: z.object({
    mainGoal: mainGoalSchema,
  }),
  gender: z.object({
    gender: genderSchema,
  }),
  age: z.object({
    age: ageSchema,
  }),
  "body-metrics": z.object({
    heightCm: heightSchema,
    weightKg: weightSchema,
  }),
  "target-weight": z.object({
    targetWeightKg: targetWeightSchema,
  }),
  "exercise-frequency": z.object({
    exerciseFrequency: exerciseFrequencySchema,
  }),
  review: z.object({}).strict(),
} satisfies Record<AssessmentStep, z.ZodType>;

const patchAssessmentEnvelopeSchema = z.object({
  step: stepSchema,
  data: z.unknown(),
});

export type PatchAssessmentData =
  | { step: "goal"; data: z.infer<(typeof patchPayloadSchemas)["goal"]> }
  | { step: "gender"; data: z.infer<(typeof patchPayloadSchemas)["gender"]> }
  | { step: "age"; data: z.infer<(typeof patchPayloadSchemas)["age"]> }
  | {
      step: "body-metrics";
      data: z.infer<(typeof patchPayloadSchemas)["body-metrics"]>;
    }
  | {
      step: "target-weight";
      data: z.infer<(typeof patchPayloadSchemas)["target-weight"]>;
    }
  | {
      step: "exercise-frequency";
      data: z.infer<(typeof patchPayloadSchemas)["exercise-frequency"]>;
    }
  | { step: "review"; data: z.infer<(typeof patchPayloadSchemas)["review"]> };

export function parseAssessmentPatch(input: unknown): PatchAssessmentData {
  const envelope = patchAssessmentEnvelopeSchema.parse(input);
  const data = patchPayloadSchemas[envelope.step].parse(envelope.data);

  return {
    step: envelope.step,
    data,
  } as PatchAssessmentData;
}
