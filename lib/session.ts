import { randomUUID } from "node:crypto";

export const SESSION_COOKIE_NAME = "health_assessment_session";
export const SESSION_HEADER_NAME = "x-session-id";

export function createSessionId() {
  return `sess_${randomUUID().replace(/-/g, "")}`;
}

export function readSessionIdFromRequest(request?: Request) {
  if (!request) {
    return null;
  }

  const headerSessionId = request.headers.get(SESSION_HEADER_NAME)?.trim();

  if (headerSessionId) {
    return headerSessionId;
  }

  try {
    const querySessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
    return querySessionId || null;
  } catch {
    return null;
  }
}

export function buildSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionId(),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}
