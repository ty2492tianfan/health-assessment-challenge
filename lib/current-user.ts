import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { readSessionIdFromRequest, SESSION_COOKIE_NAME } from "@/lib/session";

export async function getCurrentSessionId(request?: Request) {
  const cookieStore = await cookies();
  const cookieSessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (cookieSessionId) {
    return cookieSessionId;
  }

  return readSessionIdFromRequest(request);
}

export async function getCurrentUser(request?: Request) {
  const sessionId = await getCurrentSessionId(request);

  if (!sessionId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { sessionId },
  });
}

export async function getCurrentUserWithDraft(request?: Request) {
  const sessionId = await getCurrentSessionId(request);

  if (!sessionId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { sessionId },
    include: { assessmentDraft: true },
  });
}

export async function getCurrentUserWithResult(request?: Request) {
  const sessionId = await getCurrentSessionId(request);

  if (!sessionId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { sessionId },
    include: { assessmentResult: true },
  });
}
