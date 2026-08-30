"use client";

import { useEffect, useState, useTransition } from "react";

import {
  ApiError,
  activateSubscription,
  completeAssessment,
  createSession,
  getAssessment,
  getResults,
  saveAssessmentStep,
  type AssessmentProfile,
  type ExerciseFrequency,
  type Gender,
  type MainGoal,
  type ResultsResponse,
} from "@/lib/api-client";
import {
  assessmentSteps,
  firstAssessmentStep,
  type AssessmentStep,
} from "@/lib/assessment";
import {
  assessmentConstraints,
  assessmentValidationCopy,
} from "@/lib/assessment-constraints";

type Stage = "loading" | "intro" | "assessment" | "result";
type HeightUnit = "CM" | "FT_IN";
type WeightUnit = "KG" | "LB";

const editableSteps = assessmentSteps;

const emptyProfile: AssessmentProfile = {
  mainGoal: null,
  gender: null,
  age: null,
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  exerciseFrequency: null,
};

const stepMeta: Record<
  AssessmentStep,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  gender: {
    eyebrow: "Step 1",
    title: "Which profile should we use for your plan?",
    description: "A better starting point means a more realistic calorie and timeline estimate.",
  },
  goal: {
    eyebrow: "Step 2",
    title: "What's your main goal?",
    description: "We'll use this to decide whether to aim for a calorie deficit or a steady maintenance plan.",
  },
  age: {
    eyebrow: "Step 3",
    title: "How old are you?",
    description: "Age helps us estimate your daily energy needs more accurately.",
  },
  "body-metrics": {
    eyebrow: "Step 4",
    title: "Let's start with your current height and weight.",
    description: "These two numbers power your BMI and the rest of the plan.",
  },
  "target-weight": {
    eyebrow: "Step 5",
    title: "What goal weight should we plan toward?",
    description: "If you want to lose weight, choose a target below your current weight.",
  },
  "exercise-frequency": {
    eyebrow: "Step 6",
    title: "How often do you currently exercise?",
    description: "Your current routine helps us set a calorie target you can actually live with.",
  },
  review: {
    eyebrow: "Step 7",
    title: "You're ready. Let's generate your plan.",
    description: "We'll save your result, then show a free preview and the option to unlock the full plan.",
  },
};

const goalOptions: { value: MainGoal; label: string; helper: string }[] = [
  {
    value: "LOSE_WEIGHT",
    label: "Lose weight",
    helper: "A steady plan with a moderate calorie deficit and a clear target date.",
  },
  {
    value: "MAINTAIN_AND_GET_FIT",
    label: "Maintain weight and get fit",
    helper: "Keep your weight stable while getting a practical daily calorie target.",
  },
];

const genderOptions: { value: Gender; label: string; helper: string }[] = [
  { value: "FEMALE", label: "Female", helper: "We'll tailor the calorie target to a female baseline." },
  { value: "MALE", label: "Male", helper: "We'll tailor the calorie target to a male baseline." },
];

const exerciseOptions: {
  value: ExerciseFrequency;
  label: string;
  helper: string;
}[] = [
  {
    value: "ALMOST_EVERY_DAY",
    label: "Almost every day",
    helper: "You're already very active — we'll account for that.",
  },
  {
    value: "SEVERAL_TIMES_A_WEEK",
    label: "Several times a week",
    helper: "A solid, sustainable routine.",
  },
  {
    value: "SEVERAL_TIMES_A_MONTH",
    label: "Several times a month",
    helper: "We'll keep the plan gentle and realistic.",
  },
  {
    value: "NEVER",
    label: "Rarely or never",
    helper: "We'll start conservatively so the plan is easier to keep.",
  },
];

function formatStepName(step: AssessmentStep) {
  return step.replace("-", " ");
}

function formatGoal(goal: MainGoal | null) {
  if (!goal) {
    return "Not set";
  }

  return goal === "LOSE_WEIGHT" ? "Lose weight" : "Maintain weight and get fit";
}

function formatGender(gender: Gender | null) {
  if (!gender) {
    return "Not set";
  }

  return gender
    .toLowerCase()
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatExerciseFrequency(frequency: ExerciseFrequency | null) {
  if (!frequency) {
    return "Not set";
  }

  return frequency
    .toLowerCase()
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatBmiCategory(category: string) {
  return category
    .toLowerCase()
    .split("_")
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDisplayDate(dateString: string | null) {
  if (!dateString) {
    return "N/A";
  }

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getDurationDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.max(Math.round((end.getTime() - start.getTime()) / 86400000), 0);
}

function buildStepPayload(step: AssessmentStep, profile: AssessmentProfile) {
  switch (step) {
    case "goal":
      return { mainGoal: profile.mainGoal };
    case "gender":
      return { gender: profile.gender };
    case "age":
      return { age: profile.age };
    case "body-metrics":
      return { heightCm: profile.heightCm, weightKg: profile.weightKg };
    case "target-weight":
      return { targetWeightKg: profile.targetWeightKg };
    case "exercise-frequency":
      return { exerciseFrequency: profile.exerciseFrequency };
    case "review":
      return {};
  }
}

function getValidationMessage(step: AssessmentStep, profile: AssessmentProfile) {
  switch (step) {
    case "goal":
      return profile.mainGoal ? null : "Please choose a primary goal.";
    case "gender":
      return profile.gender ? null : "Please choose a calculation profile.";
    case "age":
      if (profile.age === null) {
        return "Please enter your age.";
      }

      if (
        !Number.isInteger(profile.age) ||
        profile.age < assessmentConstraints.age.min ||
        profile.age > assessmentConstraints.age.max
      ) {
        return assessmentValidationCopy.age;
      }

      return null;
    case "body-metrics":
      if (profile.heightCm === null || profile.weightKg === null) {
        return "Please enter both height and current weight.";
      }

      if (
        !Number.isInteger(profile.heightCm) ||
        profile.heightCm < assessmentConstraints.heightCm.min ||
        profile.heightCm > assessmentConstraints.heightCm.max
      ) {
        return assessmentValidationCopy.height;
      }

      if (
        profile.weightKg < assessmentConstraints.weightKg.min ||
        profile.weightKg > assessmentConstraints.weightKg.max
      ) {
        return assessmentValidationCopy.weight;
      }

      return null;
    case "target-weight":
      if (profile.targetWeightKg === null) {
        return "Please enter a target weight.";
      }

      if (
        profile.targetWeightKg < assessmentConstraints.weightKg.min ||
        profile.targetWeightKg > assessmentConstraints.weightKg.max
      ) {
        return assessmentValidationCopy.targetWeight;
      }

      if (
        profile.mainGoal === "LOSE_WEIGHT" &&
        profile.weightKg !== null &&
        profile.targetWeightKg >= profile.weightKg
      ) {
        return assessmentValidationCopy.weightLossTarget;
      }

      return null;
    case "exercise-frequency":
      return profile.exerciseFrequency ? null : "Please choose an exercise frequency.";
    case "review":
      return null;
  }
}

function getPreviousStep(step: AssessmentStep) {
  const index = editableSteps.indexOf(step);
  return editableSteps[Math.max(index - 1, 0)] ?? firstAssessmentStep;
}

function getPrimaryActionLabel(step: AssessmentStep) {
  return step === "review" ? "See my plan" : "Save and continue";
}

function getProgressPercent(step: AssessmentStep) {
  const index = editableSteps.indexOf(step);
  return (index / Math.max(editableSteps.length - 1, 1)) * 100;
}

function parseOptionalInt(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseOptionalFloat(value: string) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function roundToTwoDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function centimetersToFeetAndInches(heightCm: number) {
  const totalInches = heightCm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);

  if (inches === 12) {
    return {
      feet: feet + 1,
      inches: 0,
    };
  }

  return {
    feet,
    inches,
  };
}

function feetAndInchesToCentimeters(feet: number, inches: number) {
  return Math.round((feet * 12 + inches) * 2.54);
}

function kilogramsToPounds(weightKg: number) {
  return roundToTwoDecimals(weightKg * 2.20462);
}

function poundsToKilograms(weightLb: number) {
  return roundToTwoDecimals(weightLb / 2.20462);
}

function getAgeHint(age: number | null) {
  if (age === null) {
    return null;
  }

  if (!Number.isInteger(age)) {
    return assessmentValidationCopy.age;
  }

  if (age < assessmentConstraints.age.min || age > assessmentConstraints.age.max) {
    return assessmentValidationCopy.age;
  }

  return null;
}

function getHeightHint(heightCm: number | null) {
  if (heightCm === null) {
    return null;
  }

  if (!Number.isInteger(heightCm)) {
    return assessmentValidationCopy.height;
  }

  if (
    heightCm < assessmentConstraints.heightCm.min ||
    heightCm > assessmentConstraints.heightCm.max
  ) {
    return assessmentValidationCopy.height;
  }

  return null;
}

function getWeightHint(weightKg: number | null) {
  if (weightKg === null) {
    return null;
  }

  if (
    weightKg < assessmentConstraints.weightKg.min ||
    weightKg > assessmentConstraints.weightKg.max
  ) {
    return assessmentValidationCopy.weight;
  }

  return null;
}

function getTargetWeightHint(profile: AssessmentProfile) {
  const { targetWeightKg, weightKg, mainGoal } = profile;

  if (targetWeightKg === null) {
    return null;
  }

  if (
    targetWeightKg < assessmentConstraints.weightKg.min ||
    targetWeightKg > assessmentConstraints.weightKg.max
  ) {
    return assessmentValidationCopy.targetWeight;
  }

  if (mainGoal === "LOSE_WEIGHT" && weightKg !== null && targetWeightKg >= weightKg) {
    return assessmentValidationCopy.weightLossTarget;
  }

  return null;
}

function getBmiPreview(profile: AssessmentProfile) {
  if (
    profile.heightCm === null ||
    profile.weightKg === null ||
    !Number.isInteger(profile.heightCm) ||
    profile.heightCm < assessmentConstraints.heightCm.min ||
    profile.heightCm > assessmentConstraints.heightCm.max ||
    profile.weightKg < assessmentConstraints.weightKg.min ||
    profile.weightKg > assessmentConstraints.weightKg.max
  ) {
    return null;
  }

  const heightMeters = profile.heightCm / 100;
  const bmi = roundToTwoDecimals(profile.weightKg / (heightMeters * heightMeters));

  if (bmi < 18.5) {
    return {
      bmi,
      category: "Underweight",
      accentClass: "text-sky-700",
      panelClass: "border-sky-200 bg-sky-50",
      message: "A slightly higher calorie intake may be needed before pushing into a stronger training plan.",
    };
  }

  if (bmi < 25) {
    return {
      bmi,
      category: "Normal",
      accentClass: "text-emerald-700",
      panelClass: "border-emerald-200 bg-emerald-50",
      message: "You are starting from a healthy baseline, so we can focus on a steady and realistic plan.",
    };
  }

  if (bmi < 30) {
    return {
      bmi,
      category: "Overweight",
      accentClass: "text-amber-700",
      panelClass: "border-amber-200 bg-amber-50",
      message: "A moderate calorie deficit and steady routine can help you move toward your goal safely.",
    };
  }

  return {
    bmi,
    category: "Obese",
    accentClass: "text-rose-700",
    panelClass: "border-rose-200 bg-rose-50",
    message: "A gradual and sustainable plan is the safest way to start improving your trend over time.",
  };
}

function summarizeProfile(profile: AssessmentProfile) {
  return [
    { label: "Goal", value: formatGoal(profile.mainGoal) },
    { label: "Gender", value: formatGender(profile.gender) },
    { label: "Age", value: profile.age ? `${profile.age} years` : "Not set" },
    { label: "Height", value: profile.heightCm ? `${profile.heightCm} cm` : "Not set" },
    { label: "Weight", value: profile.weightKg ? `${profile.weightKg} kg` : "Not set" },
    {
      label: "Target",
      value: profile.targetWeightKg ? `${profile.targetWeightKg} kg` : "Not set",
    },
    {
      label: "Activity",
      value: formatExerciseFrequency(profile.exerciseFrequency),
    },
  ];
}

export default function AssessmentExperience() {
  const [stage, setStage] = useState<Stage>("loading");
  const [profile, setProfile] = useState<AssessmentProfile>(emptyProfile);
  const [activeStep, setActiveStep] = useState<AssessmentStep>(firstAssessmentStep);
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("CM");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("KG");
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        let restored;

        try {
          restored = await getAssessment();
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) {
            throw error;
          }

          await createSession();
          restored = await getAssessment();
        }

        if (cancelled) {
          return;
        }

        const restoredProfile = restored.profile ?? emptyProfile;

        if (restored.currentStep === "review") {
          try {
            const existingResults = await getResults();

            if (cancelled) {
              return;
            }

            startTransition(() => {
              setProfile(restoredProfile);
              setActiveStep(restored.currentStep);
              setResults(existingResults);
              setNotice("Previous progress and the latest result were restored.");
              setStage("result");
            });

            return;
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 404) {
              throw error;
            }
          }
        }

        startTransition(() => {
          setProfile(restoredProfile);
          setActiveStep(restored.currentStep);
          setNotice(
            restored.profile || restored.currentStep !== firstAssessmentStep
              ? "Previous progress restored. You can continue right where you left off."
              : "A secure session has been created. Your answers will be saved step by step.",
          );
          setStage(
            restored.profile || restored.currentStep !== firstAssessmentStep
              ? "assessment"
              : "intro",
          );
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to initialize the assessment.";

        startTransition(() => {
          setErrorMessage(message);
          setStage("intro");
        });
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [startTransition]);

  async function handleStart() {
    setErrorMessage(null);
    setFieldError(null);
    setStage("assessment");
  }

  async function handleContinue() {
    setErrorMessage(null);
    setFieldError(null);

    const validationMessage = getValidationMessage(activeStep, profile);

    if (validationMessage) {
      setFieldError(validationMessage);
      return;
    }

    if (activeStep === "review") {
      setIsCompleting(true);

      try {
        await completeAssessment();
        const response = await getResults();

        startTransition(() => {
          setResults(response);
          setNotice("Your plan is ready.");
          setStage("result");
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to generate the assessment result.",
        );
      } finally {
        setIsCompleting(false);
      }

      return;
    }

    setIsSaving(true);

    try {
      const response = await saveAssessmentStep(activeStep, buildStepPayload(activeStep, profile));

      startTransition(() => {
        setProfile(response.profile);
        setActiveStep(response.currentStep);
        setNotice(`Saved successfully. Next up: ${formatStepName(response.currentStep)}.`);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this step.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUnlock() {
    setErrorMessage(null);
    setIsPaying(true);

    try {
      await activateSubscription({
        provider: "mock",
        plan: "monthly",
      });

      const response = await getResults();

      startTransition(() => {
        setResults(response);
        setNotice("Payment confirmed. Your full plan is unlocked.");
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to activate subscription.");
    } finally {
      setIsPaying(false);
    }
  }

  function patchProfile(nextPatch: Partial<AssessmentProfile>) {
    setFieldError(null);
    setProfile((current) => ({
      ...current,
      ...nextPatch,
    }));
  }

  function renderStepContent() {
    switch (activeStep) {
      case "goal":
        return (
          <OptionGrid
            options={goalOptions}
            selectedValue={profile.mainGoal}
            onSelect={(value) => patchProfile({ mainGoal: value as MainGoal })}
          />
        );
      case "gender":
        return (
          <OptionGrid
            options={genderOptions}
            selectedValue={profile.gender}
            onSelect={(value) => patchProfile({ gender: value as Gender })}
          />
        );
      case "age":
        return (
          <MetricInput
            label="Age"
            suffix="years"
            value={profile.age}
            placeholder="26"
            step="1"
            validationText={getAgeHint(profile.age)}
            onChange={(value) => patchProfile({ age: parseOptionalInt(value) })}
          />
        );
      case "body-metrics":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <HeightInput
                heightCm={profile.heightCm}
                unit={heightUnit}
                validationText={getHeightHint(profile.heightCm)}
                onUnitChange={setHeightUnit}
                onChange={(heightCm) => patchProfile({ heightCm })}
              />
              <WeightInput
                label="Current weight"
                weightKg={profile.weightKg}
                unit={weightUnit}
                validationText={getWeightHint(profile.weightKg)}
                onUnitChange={setWeightUnit}
                onChange={(weightKg) => patchProfile({ weightKg })}
              />
            </div>
            <BodyMetricsPreview profile={profile} />
          </div>
        );
      case "target-weight":
        return (
          <WeightInput
            label="Target weight"
            weightKg={profile.targetWeightKg}
            unit={weightUnit}
            validationText={getTargetWeightHint(profile)}
            onUnitChange={setWeightUnit}
            helperText={
              profile.weightKg
                ? `Current saved weight: ${
                    weightUnit === "KG"
                      ? `${profile.weightKg} kg`
                      : `${kilogramsToPounds(profile.weightKg)} lb`
                  }`
                : "Save your current weight first to unlock the full validation."
            }
            onChange={(weightKg) => patchProfile({ targetWeightKg: weightKg })}
          />
        );
      case "exercise-frequency":
        return (
          <OptionGrid
            options={exerciseOptions}
            selectedValue={profile.exerciseFrequency}
            onSelect={(value) => patchProfile({ exerciseFrequency: value as ExerciseFrequency })}
          />
        );
      case "review":
        return (
          <div className="rounded-[1.75rem] border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] p-5">
            <h3 className="font-semibold text-[color:var(--color-ink)]">Calculation inputs ready</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {summarizeProfile(profile).map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[color:var(--color-ink)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
    }
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-[-10rem] h-[22rem] bg-[radial-gradient(circle_at_top,_rgba(226,194,152,0.32),_transparent_60%)]" />
      <div className="pointer-events-none absolute right-[-8rem] top-[18rem] h-72 w-72 rounded-full bg-[rgba(183,132,93,0.12)] blur-3xl" />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--color-muted)]">
              Personal wellness plan
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-tight text-[color:var(--color-ink)] sm:text-5xl">
              Find a plan that fits you
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stage === "assessment" ? (
              <div className="rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-accent)]">
                {editableSteps.indexOf(activeStep) + 1}/{editableSteps.length}
              </div>
            ) : null}
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[color:var(--color-surface)] p-6 shadow-[0_24px_80px_rgba(104,67,49,0.12)] sm:p-8">
          {stage === "loading" ? (
            <LoadingPanel />
          ) : stage === "intro" ? (
            <IntroPanel
              notice={notice}
              errorMessage={errorMessage}
              hasProgress={profile.mainGoal !== null || activeStep !== firstAssessmentStep}
              onStart={handleStart}
            />
          ) : stage === "assessment" ? (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
                    {stepMeta[activeStep].eyebrow}
                  </p>
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight text-[color:var(--color-ink)]">
                    {stepMeta[activeStep].title}
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--color-muted)]">
                    {stepMeta[activeStep].description}
                  </p>
                </div>
              </div>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-[color:var(--color-line)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-accent-soft))] transition-all"
                  style={{ width: `${getProgressPercent(activeStep)}%` }}
                />
              </div>

              {notice ? (
                <div className="mt-6 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] px-4 py-3 text-sm text-[color:var(--color-ink)]">
                  {notice}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {fieldError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {fieldError}
                </div>
              ) : null}

              <div className="mt-8 flex-1">{renderStepContent()}</div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setFieldError(null);
                    setActiveStep(getPreviousStep(activeStep));
                  }}
                  disabled={activeStep === firstAssessmentStep || isSaving || isCompleting}
                  className="inline-flex items-center justify-center rounded-full border border-[color:var(--color-line-strong)] px-5 py-3 text-sm font-semibold text-[color:var(--color-ink)] transition hover:border-[color:var(--color-accent)] hover:bg-[color:var(--color-panel-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  disabled={isSaving || isCompleting || isPending}
                  className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[color:rgba(82,47,33,0.16)] transition hover:bg-[color:var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving || isCompleting
                    ? "Working..."
                    : getPrimaryActionLabel(activeStep)}
                </button>
              </div>
            </div>
          ) : (
            <ResultPanel
              results={results}
              errorMessage={errorMessage}
              isPaying={isPaying}
              onUnlock={() => void handleUnlock()}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function IntroPanel({
  hasProgress,
  notice,
  errorMessage,
  onStart,
}: {
  hasProgress: boolean;
  notice: string | null;
  errorMessage: string | null;
  onStart: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
          2-minute check-in
        </p>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight text-[color:var(--color-ink)]">
          A clearer picture of your health starts with a few honest answers.
        </h2>
        <p className="mt-4 text-sm leading-7 text-[color:var(--color-muted)]">
          Tell us your goal, body metrics, and current routine. We will calculate a personal BMI snapshot, calorie target, and timeline — then you can unlock the full plan when you are ready.
        </p>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] px-4 py-3 text-sm text-[color:var(--color-ink)]">
            {notice}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4">
          <InfoStrip
            title="Saved as you go"
            value="Close the page anytime — your answers will be waiting when you come back."
          />
          <InfoStrip title="Free snapshot" value="See your BMI, category, and a short summary at no cost." />
          <InfoStrip
            title="Full plan"
            value="Unlock your calorie target, target date, and projected progress curve."
          />
        </div>
      </div>

      <div className="mt-10">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex w-full items-center justify-center rounded-full bg-[color:var(--color-accent)] px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-[color:rgba(82,47,33,0.16)] transition hover:bg-[color:var(--color-accent-strong)]"
        >
          {hasProgress ? "Resume assessment" : "Start assessment"}
        </button>
      </div>
    </div>
  );
}

function ResultPanel({
  results,
  errorMessage,
  isPaying,
  onUnlock,
}: {
  results: ResultsResponse | null;
  errorMessage: string | null;
  isPaying: boolean;
  onUnlock: () => void;
}) {
  const [showCheckout, setShowCheckout] = useState(false);

  if (!results) {
    return <LoadingPanel />;
  }

  const { result, paywall, subscriptionStatus } = results;
  const accessLabel = subscriptionStatus === "ACTIVE" ? "Full access" : "Free preview";
  const projectedCurve = result.projectedCurve ?? [];
  const firstCurvePoint = projectedCurve[0] ?? null;
  const lastCurvePoint = projectedCurve.at(-1) ?? null;
  const durationDays = getDurationDays(firstCurvePoint?.date ?? null, result.targetDate ?? null);
  const estimatedWeightChange =
    firstCurvePoint && lastCurvePoint
      ? roundToTwoDecimals(firstCurvePoint.weightKg - lastCurvePoint.weightKg)
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
            Result
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight text-[color:var(--color-ink)]">
            Your assessment is ready.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--color-muted)]">
            Here is your free snapshot. Unlock the full plan to see calorie guidance, a target date, and the projected curve.
          </p>
        </div>
        <div className="rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent)]">
          {accessLabel}
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <ResultMetric label="BMI" value={result.bmi.toFixed(2)} />
        <ResultMetric label="Category" value={result.bmiCategory} />
      </div>

      <div className="mt-4 rounded-[1.75rem] border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          Summary
        </p>
        <p className="mt-3 text-sm leading-7 text-[color:var(--color-ink)]">
          {result.summaryText ?? "Your result summary is available."}
        </p>
      </div>

      {paywall.isLocked ? (
        showCheckout ? (
          <MockCheckoutPanel
            isPaying={isPaying}
            lockedFields={paywall.lockedFields}
            onBack={() => setShowCheckout(false)}
            onConfirm={onUnlock}
          />
        ) : (
          <LockedPreviewPanel
            message={paywall.message}
            lockedFields={paywall.lockedFields}
            onContinue={() => setShowCheckout(true)}
          />
        )
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-[1.75rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(235,251,240,0.98),rgba(248,255,250,0.94))]">
            <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Payment confirmed
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-[color:var(--color-ink)]">
                  Your full assessment has been unlocked.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--color-muted)]">
                  Your calorie target, timeline, and projected progress are now available for this session.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <CompactResultTile
                  label="Starting weight"
                  value={firstCurvePoint ? `${firstCurvePoint.weightKg} kg` : "N/A"}
                />
                <CompactResultTile
                  label="Goal weight"
                  value={lastCurvePoint ? `${lastCurvePoint.weightKg} kg` : "N/A"}
                />
                <CompactResultTile
                  label="Estimated duration"
                  value={durationDays !== null ? `${durationDays} days` : "N/A"}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ResultMetric
              label="Daily calorie target"
              value={result.dailyCalorieTarget ? `${result.dailyCalorieTarget} kcal` : "N/A"}
            />
            <ResultMetric
              label="Predicted target date"
              value={formatDisplayDate(result.targetDate ?? null)}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <ResultMetric
              label="Expected change"
              value={estimatedWeightChange !== null ? `${estimatedWeightChange} kg` : "N/A"}
            />
            <ResultMetric
              label="Starting point"
              value={firstCurvePoint ? `${firstCurvePoint.weightKg} kg` : "N/A"}
            />
            <ResultMetric
              label="Goal category"
              value={formatBmiCategory(result.bmiCategory)}
            />
          </div>

          <div className="mt-4 rounded-[1.75rem] border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
              What this unlock means
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <PreviewFeature
                title="Calorie guidance"
                value="A concrete daily target is now available instead of a teaser."
              />
              <PreviewFeature
                title="Timeline"
                value="The server-generated target date is now visible in full."
              />
              <PreviewFeature
                title="Trend data"
                value="Each projected checkpoint is now readable from start to finish."
              />
            </div>
          </div>

          <div className="mt-4 rounded-[1.75rem] border border-[color:var(--color-line)] bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
                  Projected curve
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[color:var(--color-ink)]">
                  Weight trend toward the goal
                </h3>
              </div>
              <div className="rounded-full bg-[color:var(--color-panel-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-accent)]">
                Unlocked
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {projectedCurve.map((point, index, array) => {
                const progress =
                  array.length <= 1 ? 100 : (index / (array.length - 1)) * 100;

                return (
                  <div key={`${point.date}-${point.weightKg}`}>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-[color:var(--color-muted)]">
                        {formatDisplayDate(point.date)}
                      </span>
                      <span className="text-sm font-semibold text-[color:var(--color-ink)]">
                        {point.weightKg} kg
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--color-line)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-success))]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LockedPreviewPanel({
  message,
  lockedFields,
  onContinue,
}: {
  message: string | null;
  lockedFields: string[];
  onContinue: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-[1.75rem] border border-[color:var(--color-line-strong)] bg-[linear-gradient(160deg,rgba(255,249,240,0.98),rgba(241,226,210,0.94))]">
      <div className="border-b border-[color:var(--color-line)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          Member preview
        </p>
        <h3 className="mt-3 text-xl font-semibold text-[color:var(--color-ink)]">
          Unlock your full plan
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--color-muted)]">
          {message}
        </p>
      </div>
      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-white/80 bg-white/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
            Included after unlock
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PreviewFeature
              title="Daily calorie target"
              value="Personalized kcal goal"
            />
            <PreviewFeature
              title="Target date"
              value="Projected milestone"
            />
            <PreviewFeature
              title="Progress curve"
              value="Timeline and checkpoints"
            />
            <PreviewFeature
              title="Saved access"
              value="This session stays unlocked"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {lockedFields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-[color:var(--color-line-strong)] bg-[color:var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-accent)]"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-[color:var(--color-accent)] p-5 text-white shadow-[0_20px_60px_rgba(82,47,33,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted-on-dark)]">
            Offer
          </p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl font-semibold">$9.99</span>
            <span className="pb-1 text-sm text-[color:var(--color-muted-on-dark)]">/ month</span>
          </div>
          <p className="mt-4 text-sm leading-7 text-[color:var(--color-warm-ink)]">
            One payment unlocks your calorie target, timeline, and projected progress for this session.
          </p>
          <div className="mt-5 space-y-2 text-sm text-[color:var(--color-warm-ink)]">
            <BenefitLine text="Calorie target revealed" />
            <BenefitLine text="Target date unlocked" />
            <BenefitLine text="Projected curve visible" />
          </div>
          <button
            type="button"
            onClick={onContinue}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-accent)] transition hover:bg-[color:var(--color-panel-soft)]"
          >
            Continue to payment
          </button>
        </div>
      </div>
    </div>
  );
}

function MockCheckoutPanel({
  isPaying,
  lockedFields,
  onBack,
  onConfirm,
}: {
  isPaying: boolean;
  lockedFields: string[];
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-[1.75rem] border border-[color:var(--color-line-strong)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(242,231,217,0.94))]">
      <div className="border-b border-[color:var(--color-line)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          Mock checkout
        </p>
        <h3 className="mt-3 text-xl font-semibold text-[color:var(--color-ink)]">
          Complete your unlock
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--color-muted)]">
          This is a simulated checkout for the demo. Confirming below unlocks the full plan for this session — no real charge is made.
        </p>
      </div>
      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
                  Selected plan
                </p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--color-ink)]">
                  Full result access
                </p>
              </div>
              <div className="rounded-full bg-[color:var(--color-panel-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-accent)]">
                Monthly
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {lockedFields.map((field) => (
                <PreviewFeature key={field} title={field} value="Will be unlocked after payment" />
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
              Payment method
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <PaymentChip label="Visa" />
              <PaymentChip label="Mastercard" />
              <PaymentChip label="PayPal" />
            </div>
            <p className="mt-4 text-sm leading-7 text-[color:var(--color-muted)]">
              No real charge is made in this version. The confirmation button exists only to demonstrate the protected unlock flow.
            </p>
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-[color:var(--color-accent)] p-5 text-white shadow-[0_20px_60px_rgba(82,47,33,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted-on-dark)]">
            Order summary
          </p>
          <div className="mt-4 space-y-3 border-b border-white/15 pb-4 text-sm text-[color:var(--color-warm-ink)]">
            <SummaryRow label="Full result access" value="$9.99" />
            <SummaryRow label="Setup fee" value="$0.00" />
            <SummaryRow label="Total due today" value="$9.99" strong />
          </div>
          <div className="mt-4 rounded-[1.25rem] bg-white/10 px-4 py-3 text-sm leading-7 text-[color:var(--color-warm-ink)]">
            After confirmation, your full plan — calorie target, timeline, and progress curve — will appear instantly.
          </div>
          <div className="mt-5 space-y-2 text-sm text-[color:var(--color-warm-ink)]">
            <BenefitLine text="Secure mock checkout" />
            <BenefitLine text="Instant unlock on success" />
            <BenefitLine text="Saved to this session" />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPaying}
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-accent)] transition hover:bg-[color:var(--color-panel-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaying ? "Processing payment..." : "Pay $9.99 now"}
            </button>
            <button
              type="button"
              onClick={onBack}
              disabled={isPaying}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Back to preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-16 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[color:var(--color-line)] border-t-[color:var(--color-accent)]" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--color-muted)]">
          Loading
        </p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[color:var(--color-ink)]">
          Preparing your saved experience
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--color-muted)]">
          We are checking for an existing session and restoring any persisted progress.
        </p>
      </div>
    </div>
  );
}

function InfoStrip({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[color:var(--color-line)] bg-white/75 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
        {title}
      </p>
      <p className="mt-2 text-sm leading-7 text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-line)] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}

function CompactResultTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-emerald-200 bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}

function PreviewFeature({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-[color:var(--color-line)] bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
        {title}
      </p>
      <p className="mt-2 text-sm font-medium text-[color:var(--color-ink)]">{value}</p>
    </div>
  );
}

function PaymentChip({ label }: { label: string }) {
  return (
    <div className="rounded-[1rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-3 text-center text-sm font-semibold text-[color:var(--color-ink)]">
      {label}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-semibold text-white" : ""}>{label}</span>
      <span className={strong ? "font-semibold text-white" : ""}>{value}</span>
    </div>
  );
}

function BenefitLine({ text }: { text: string }) {
  return <p>+ {text}</p>;
}

function OptionGrid({
  options,
  selectedValue,
  onSelect,
}: {
  options: { value: string; label: string; helper: string }[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {options.map((option) => {
        const selected = selectedValue === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`group w-full rounded-[1.75rem] border px-5 py-5 text-left transition ${
              selected
                ? "border-[color:var(--color-accent)] bg-[color:var(--color-panel-soft)] shadow-[0_14px_40px_rgba(82,47,33,0.10)]"
                : "border-[color:var(--color-line)] bg-white hover:border-[color:var(--color-line-strong)] hover:bg-[color:var(--color-panel-soft)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--color-ink)]">{option.label}</h3>
                <p className="mt-2 text-sm leading-7 text-[color:var(--color-muted)]">{option.helper}</p>
              </div>
              <span
                className={`mt-1 inline-flex h-6 w-6 shrink-0 rounded-full border transition ${
                  selected
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]"
                    : "border-[color:var(--color-line-strong)] bg-white group-hover:border-[color:var(--color-accent)]"
                }`}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MetricInput({
  label,
  suffix,
  value,
  placeholder,
  step,
  helperText,
  validationText,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | null;
  placeholder: string;
  step: string;
  helperText?: string;
  validationText?: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={`block rounded-[1.75rem] border bg-white p-5 ${
        validationText
          ? "border-red-300"
          : "border-[color:var(--color-line)]"
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
        {label}
      </span>
      <div className="mt-4 flex items-end gap-3 border-b border-[color:var(--color-line)] pb-4">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-line-strong)]"
        />
        <span className="pb-1 text-xl font-semibold text-[color:var(--color-ink)]">{suffix}</span>
      </div>
      {helperText ? (
        <span className="mt-3 block text-sm leading-7 text-[color:var(--color-muted)]">
          {helperText}
        </span>
      ) : null}
      {validationText ? (
        <ValidationNotice>{validationText}</ValidationNotice>
      ) : null}
    </label>
  );
}

function ValidationNotice({ children }: { children: string }) {
  return (
    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-7 text-red-700">
      {children}
    </div>
  );
}

function UnitToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-panel-soft)] p-1">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              active
                ? "bg-white text-[color:var(--color-ink)] shadow-sm"
                : "text-[color:var(--color-muted)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function HeightInput({
  heightCm,
  unit,
  validationText,
  onUnitChange,
  onChange,
}: {
  heightCm: number | null;
  unit: HeightUnit;
  validationText?: string | null;
  onUnitChange: (unit: HeightUnit) => void;
  onChange: (heightCm: number | null) => void;
}) {
  const initialImperial = heightCm === null ? null : centimetersToFeetAndInches(heightCm);
  const [feetInput, setFeetInput] = useState(initialImperial ? String(initialImperial.feet) : "");
  const [inchesInput, setInchesInput] = useState(
    initialImperial ? String(initialImperial.inches) : "",
  );

  const inchesValue = parseOptionalInt(inchesInput);
  const inchesWarning =
    unit === "FT_IN" && inchesValue !== null && (inchesValue < 0 || inchesValue > 11)
      ? "Inches should stay between 0 and 11."
      : null;

  function handleUnitToggle(nextUnit: HeightUnit) {
    if (nextUnit === unit) {
      return;
    }

    if (nextUnit === "FT_IN") {
      if (heightCm === null) {
        setFeetInput("");
        setInchesInput("");
      } else {
        const converted = centimetersToFeetAndInches(heightCm);
        setFeetInput(String(converted.feet));
        setInchesInput(String(converted.inches));
      }
    }

    onUnitChange(nextUnit);
  }

  return (
    <div
      className={`rounded-[1.75rem] border bg-white p-5 ${
        validationText || inchesWarning
          ? "border-red-300"
          : "border-[color:var(--color-line)]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          Height
        </span>
        <UnitToggle
          value={unit}
          options={[
            { value: "CM", label: "cm" },
            { value: "FT_IN", label: "ft/in" },
          ]}
          onChange={handleUnitToggle}
        />
      </div>

      {unit === "CM" ? (
        <div className="mt-4 flex items-end gap-3 border-b border-[color:var(--color-line)] pb-4">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={heightCm ?? ""}
            placeholder="168"
            onChange={(event) => onChange(parseOptionalInt(event.target.value))}
            className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-line-strong)]"
          />
          <span className="pb-1 text-xl font-semibold text-[color:var(--color-ink)]">cm</span>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 border-b border-[color:var(--color-line)] pb-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
              Feet
            </span>
            <div className="mt-2 flex items-end gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={feetInput}
                placeholder="5"
                onChange={(event) => {
                  const nextFeetInput = event.target.value;
                  const nextFeet = parseOptionalInt(nextFeetInput);
                  const nextInches = parseOptionalInt(inchesInput) ?? 0;

                  setFeetInput(nextFeetInput);

                  if (nextFeet === null && inchesInput.trim() === "") {
                    onChange(null);
                    return;
                  }

                  onChange(feetAndInchesToCentimeters(nextFeet ?? 0, nextInches));
                }}
                className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-line-strong)]"
              />
              <span className="pb-1 text-xl font-semibold text-[color:var(--color-ink)]">ft</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--color-muted)]">
              Inches
            </span>
            <div className="mt-2 flex items-end gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={inchesInput}
                placeholder="6"
                onChange={(event) => {
                  const nextInchesInput = event.target.value;
                  const nextFeet = parseOptionalInt(feetInput) ?? 0;
                  const nextInches = parseOptionalInt(nextInchesInput);

                  setInchesInput(nextInchesInput);

                  if (nextInches === null && feetInput.trim() === "") {
                    onChange(null);
                    return;
                  }

                  onChange(feetAndInchesToCentimeters(nextFeet, nextInches ?? 0));
                }}
                className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-line-strong)]"
              />
              <span className="pb-1 text-xl font-semibold text-[color:var(--color-ink)]">in</span>
            </div>
          </label>
        </div>
      )}

      {validationText ? <ValidationNotice>{validationText}</ValidationNotice> : null}
      {inchesWarning ? <ValidationNotice>{inchesWarning}</ValidationNotice> : null}
    </div>
  );
}

function WeightInput({
  label,
  weightKg,
  unit,
  helperText,
  validationText,
  onUnitChange,
  onChange,
}: {
  label: string;
  weightKg: number | null;
  unit: WeightUnit;
  helperText?: string;
  validationText?: string | null;
  onUnitChange: (unit: WeightUnit) => void;
  onChange: (weightKg: number | null) => void;
}) {
  const [draftValue, setDraftValue] = useState(() => {
    if (weightKg === null) {
      return "";
    }

    return unit === "KG" ? String(weightKg) : String(kilogramsToPounds(weightKg));
  });

  function handleUnitToggle(nextUnit: WeightUnit) {
    if (nextUnit === unit) {
      return;
    }

    if (weightKg === null) {
      setDraftValue("");
    } else {
      setDraftValue(
        nextUnit === "KG" ? String(weightKg) : String(kilogramsToPounds(weightKg)),
      );
    }

    onUnitChange(nextUnit);
  }

  return (
    <div
      className={`rounded-[1.75rem] border bg-white p-5 ${
        validationText
          ? "border-red-300"
          : "border-[color:var(--color-line)]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          {label}
        </span>
        <UnitToggle
          value={unit}
          options={[
            { value: "KG", label: "kg" },
            { value: "LB", label: "lb" },
          ]}
          onChange={handleUnitToggle}
        />
      </div>
      <div className="mt-4 flex items-end gap-3 border-b border-[color:var(--color-line)] pb-4">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={draftValue}
          placeholder={unit === "KG" ? "65" : "143.3"}
          onChange={(event) => {
            const nextValue = event.target.value;
            const parsed = parseOptionalFloat(nextValue);

            setDraftValue(nextValue);
            onChange(
              parsed === null ? null : unit === "KG" ? parsed : poundsToKilograms(parsed),
            );
          }}
          className="w-full bg-transparent text-5xl font-semibold tracking-tight text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-line-strong)]"
        />
        <span className="pb-1 text-xl font-semibold text-[color:var(--color-ink)]">
          {unit === "KG" ? "kg" : "lb"}
        </span>
      </div>
      {helperText ? (
        <span className="mt-3 block text-sm leading-7 text-[color:var(--color-muted)]">
          {helperText}
        </span>
      ) : null}
      {validationText ? (
        <ValidationNotice>{validationText}</ValidationNotice>
      ) : null}
    </div>
  );
}

function BodyMetricsPreview({ profile }: { profile: AssessmentProfile }) {
  const bmiPreview = getBmiPreview(profile);

  if (!bmiPreview) {
    return null;
  }

  return (
    <div className={`rounded-[1.75rem] border px-5 py-5 ${bmiPreview.panelClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
        BMI preview
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-[color:var(--color-ink)]">
        Your BMI is{" "}
        <span className={bmiPreview.accentClass}>{bmiPreview.bmi}</span> which is considered{" "}
        <span className={bmiPreview.accentClass}>{bmiPreview.category.toLowerCase()}</span>.
      </h3>
      <p className="mt-3 text-sm leading-7 text-[color:var(--color-ink)]">
        {bmiPreview.message}
      </p>
    </div>
  );
}
