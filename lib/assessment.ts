export const assessmentSteps = [
  "gender",
  "goal",
  "age",
  "body-metrics",
  "target-weight",
  "exercise-frequency",
  "review",
] as const;

export type AssessmentStep = (typeof assessmentSteps)[number];
export const firstAssessmentStep: AssessmentStep = assessmentSteps[0];

const stepOrder = new Map(assessmentSteps.map((step, index) => [step, index]));

export function getNextStep(step: AssessmentStep): AssessmentStep {
  const index = stepOrder.get(step) ?? 0;
  return assessmentSteps[Math.min(index + 1, assessmentSteps.length - 1)];
}

export function getFurthestStep(
  currentStep: string | null | undefined,
  candidateStep: AssessmentStep,
): AssessmentStep {
  const currentIndex = stepOrder.get((currentStep as AssessmentStep) ?? firstAssessmentStep) ?? 0;
  const candidateIndex = stepOrder.get(candidateStep) ?? 0;

  return candidateIndex > currentIndex
    ? candidateStep
    : assessmentSteps[currentIndex] ?? firstAssessmentStep;
}
