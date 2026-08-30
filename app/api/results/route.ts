import { NextResponse } from "next/server";

import { getCurrentUserWithResult } from "@/lib/current-user";
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

export async function GET(request: Request) {
  const user = await getCurrentUserWithResult(request);

  if (!user) {
    return unauthorizedResponse();
  }

  if (!user.assessmentResult) {
    return NextResponse.json(
      {
        error: {
          code: "RESULT_NOT_FOUND",
          message: "Assessment result was not found.",
        },
      },
      { status: 404 },
    );
  }

  const result = serializeAssessmentResult(user.assessmentResult);

  return NextResponse.json(buildResultsResponse(result, user.subscriptionStatus));
}
