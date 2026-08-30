import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  calculateAssessmentResult,
  prepareAssessmentInput,
} from "@/lib/assessment-engine";
import { getCurrentUserWithDraft } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { buildResultsResponse, serializeAssessmentResult } from "@/lib/results";

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

export async function POST(request: Request) {
  const user = await getCurrentUserWithDraft(request);

  if (!user) {
    return unauthorizedResponse();
  }

  if (!user.assessmentDraft) {
    return NextResponse.json(
      {
        error: {
          code: "DRAFT_NOT_FOUND",
          message: "Assessment draft was not found.",
        },
      },
      { status: 404 },
    );
  }

  const preparedInput = prepareAssessmentInput(user.assessmentDraft);

  if (!preparedInput.ok) {
    if (preparedInput.code === "INCOMPLETE_ASSESSMENT") {
      return NextResponse.json(
        {
          error: {
            code: preparedInput.code,
            message: "Assessment data is incomplete.",
            missingFields: preparedInput.missingFields,
          },
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: preparedInput.code,
          message: preparedInput.message,
        },
      },
      { status: 422 },
    );
  }

  const calculatedResult = calculateAssessmentResult(preparedInput.input);
  const generatedAt = new Date();

  const storedResult = await prisma.assessmentResult.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      bmi: new Prisma.Decimal(calculatedResult.bmi),
      bmiCategory: calculatedResult.bmiCategory,
      dailyCalorieTarget: calculatedResult.dailyCalorieTarget,
      targetDate: calculatedResult.targetDate,
      projectedCurve: calculatedResult.projectedCurve,
      summaryText: calculatedResult.summaryText,
      generatedAt,
    },
    update: {
      bmi: new Prisma.Decimal(calculatedResult.bmi),
      bmiCategory: calculatedResult.bmiCategory,
      dailyCalorieTarget: calculatedResult.dailyCalorieTarget,
      targetDate: calculatedResult.targetDate,
      projectedCurve: calculatedResult.projectedCurve,
      summaryText: calculatedResult.summaryText,
      generatedAt,
    },
  });

  const result = serializeAssessmentResult(storedResult);

  return NextResponse.json({
    success: true,
    resultId: storedResult.id,
    ...buildResultsResponse(result, user.subscriptionStatus),
  });
}
