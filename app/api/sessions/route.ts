import { NextResponse } from "next/server";

import { getCurrentSessionId } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const existingSessionId = await getCurrentSessionId(request);

  if (existingSessionId) {
    const existingUser = await prisma.user.findUnique({
      where: { sessionId: existingSessionId },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          sessionId: existingUser.sessionId,
          subscriptionStatus: existingUser.subscriptionStatus,
        },
        { status: 200 },
      );
    }
  }

  const sessionCookie = buildSessionCookie();

  const user = await prisma.user.create({
    data: {
      sessionId: sessionCookie.value,
      assessmentDraft: {
        create: {},
      },
    },
  });

  const response = NextResponse.json(
    {
      sessionId: user.sessionId,
      subscriptionStatus: user.subscriptionStatus,
    },
    { status: 201 },
  );

  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  return response;
}
