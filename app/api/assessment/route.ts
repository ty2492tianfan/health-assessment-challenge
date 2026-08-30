import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { firstAssessmentStep, getFurthestStep, getNextStep } from "@/lib/assessment";
import { getCurrentSessionId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { parseAssessmentPatch } from "@/lib/validation/assessment";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid session.",
      },
    },
    { status: 401 },
  );
}

function serializeDraft(draft: {
  mainGoal: string | null;
  gender: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: Prisma.Decimal | null;
  targetWeightKg: Prisma.Decimal | null;
  exerciseFrequency: string | null;
}) {
  return {
    mainGoal: draft.mainGoal,
    gender: draft.gender,
    age: draft.age,
    heightCm: draft.heightCm,
    weightKg: draft.weightKg ? Number(draft.weightKg) : null,
    targetWeightKg: draft.targetWeightKg ? Number(draft.targetWeightKg) : null,
    exerciseFrequency: draft.exerciseFrequency,
  };
}

function validationErrorResponse(error: ZodError) {
  const details = Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "root", issue.message]),
  );

  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input.",
        details,
      },
    },
    { status: 422 },
  );
}

function buildDraftWriteData(parsedBody: ReturnType<typeof parseAssessmentPatch>) {
  const createData: Prisma.AssessmentDraftUncheckedCreateInput = {
    userId: "",
    currentStep: firstAssessmentStep,
  };
  const updateData: Prisma.AssessmentDraftUncheckedUpdateInput = {};

  switch (parsedBody.step) {
    case "goal":
      createData.mainGoal = parsedBody.data.mainGoal;
      updateData.mainGoal = parsedBody.data.mainGoal;
      break;
    case "gender":
      createData.gender = parsedBody.data.gender;
      updateData.gender = parsedBody.data.gender;
      break;
    case "age":
      createData.age = parsedBody.data.age;
      updateData.age = parsedBody.data.age;
      break;
    case "body-metrics":
      createData.heightCm = parsedBody.data.heightCm;
      createData.weightKg = new Prisma.Decimal(parsedBody.data.weightKg);
      updateData.heightCm = parsedBody.data.heightCm;
      updateData.weightKg = new Prisma.Decimal(parsedBody.data.weightKg);
      break;
    case "target-weight":
      createData.targetWeightKg = new Prisma.Decimal(parsedBody.data.targetWeightKg);
      updateData.targetWeightKg = new Prisma.Decimal(parsedBody.data.targetWeightKg);
      break;
    case "exercise-frequency":
      createData.exerciseFrequency = parsedBody.data.exerciseFrequency;
      updateData.exerciseFrequency = parsedBody.data.exerciseFrequency;
      break;
    case "review":
      break;
  }

  return { createData, updateData };
}

export async function GET(request: Request) {
  const sessionId = await getCurrentSessionId(request);

  if (!sessionId) {
    return unauthorizedResponse();
  }

  const user = await prisma.user.findUnique({
    where: { sessionId },
    include: { assessmentDraft: true },
  });

  if (!user) {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    sessionId: user.sessionId,
    currentStep: user.assessmentDraft?.currentStep ?? firstAssessmentStep,
    profile: user.assessmentDraft ? serializeDraft(user.assessmentDraft) : null,
  });
}

export async function PATCH(request: Request) {
  const sessionId = await getCurrentSessionId(request);

  if (!sessionId) {
    return unauthorizedResponse();
  }

  const user = await prisma.user.findUnique({
    where: { sessionId },
    include: { assessmentDraft: true },
  });

  if (!user) {
    return unauthorizedResponse();
  }

  let parsedBody;

  try {
    parsedBody = parseAssessmentPatch(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }

    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Unable to parse request body.",
        },
      },
      { status: 400 },
    );
  }

  const nextStep = getNextStep(parsedBody.step);
  const { createData, updateData } = buildDraftWriteData(parsedBody);
  createData.userId = user.id;

  const draft = await prisma.$transaction(async (transaction) => {
    const lockedRows = await transaction.$queryRaw<Array<{ current_step: string }>>`
      SELECT current_step
      FROM assessment_drafts
      WHERE user_id = ${user.id}
      FOR UPDATE
    `;

    const currentStep = getFurthestStep(
      lockedRows[0]?.current_step ?? user.assessmentDraft?.currentStep,
      nextStep,
    );

    createData.currentStep = currentStep;
    updateData.currentStep = currentStep;

    return transaction.assessmentDraft.upsert({
      where: { userId: user.id },
      create: createData,
      update: updateData,
    });
  });

  return NextResponse.json({
    success: true,
    currentStep: draft.currentStep,
    profile: serializeDraft(draft),
  });
}
