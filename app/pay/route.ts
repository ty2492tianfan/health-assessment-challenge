import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { parsePayPayload } from "@/lib/validation/payment";

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

async function parseRequestBody(request: Request) {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return parsePayPayload({});
  }

  return parsePayPayload(JSON.parse(rawBody));
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  let parsedBody;

  try {
    parsedBody = await parseRequestBody(request);
  } catch (error) {
    if (error instanceof ZodError) {
      const details = Object.fromEntries(
        error.issues.map((issue) => [issue.path.join(".") || "root", issue.message]),
      );

      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid payment payload.",
            details,
          },
        },
        { status: 422 },
      );
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

  const paymentResult = await prisma.$transaction(async (transaction) => {
    const updatedUser = await transaction.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
      },
    });

    const paymentEvent = await transaction.paymentEvent.create({
      data: {
        userId: user.id,
        provider: parsedBody.provider,
        plan: parsedBody.plan,
        externalRef: parsedBody.externalRef,
        status: "SUCCEEDED",
        payload: parsedBody as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    return {
      subscriptionStatus: updatedUser.subscriptionStatus,
      paymentEventId: paymentEvent.id,
    };
  });

  return NextResponse.json({
    success: true,
    subscriptionStatus: paymentResult.subscriptionStatus,
    paymentEventId: paymentResult.paymentEventId,
  });
}
