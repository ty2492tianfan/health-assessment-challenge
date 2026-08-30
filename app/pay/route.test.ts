import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  transactionMock: {
    user: {
      update: vi.fn(),
    },
    paymentEvent: {
      create: vi.fn(),
    },
  },
  prismaTransaction: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocked.getCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocked.prismaTransaction,
  },
}));

import { POST } from "@/app/pay/route";

describe("POST /pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.prismaTransaction.mockImplementation(async (callback) =>
      callback(mocked.transactionMock),
    );
  });

  it("activates the subscription and records the payment event", async () => {
    mocked.getCurrentUser.mockResolvedValue({
      id: "user_1",
    });
    mocked.transactionMock.user.update.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
    });
    mocked.transactionMock.paymentEvent.create.mockResolvedValue({
      id: "pay_evt_1",
    });

    const request = new Request("http://localhost:3000/pay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "mock",
        plan: "monthly",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocked.transactionMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        subscriptionStatus: "ACTIVE",
      },
    });
    expect(mocked.transactionMock.paymentEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        provider: "mock",
        plan: "monthly",
        externalRef: undefined,
        status: "SUCCEEDED",
        payload: {
          provider: "mock",
          plan: "monthly",
        },
        processedAt: expect.any(Date),
      },
    });
    expect(body).toEqual({
      success: true,
      subscriptionStatus: "ACTIVE",
      paymentEventId: "pay_evt_1",
    });
  });

  it("returns 401 when the current session is missing or invalid", async () => {
    mocked.getCurrentUser.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/pay", {
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid session.",
      },
    });
  });

  it("returns 400 for malformed JSON payloads", async () => {
    mocked.getCurrentUser.mockResolvedValue({
      id: "user_1",
    });

    const request = new Request("http://localhost:3000/pay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Unable to parse request body.",
      },
    });
  });

  it("returns 422 for invalid payment payload types", async () => {
    mocked.getCurrentUser.mockResolvedValue({
      id: "user_1",
    });

    const request = new Request("http://localhost:3000/pay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payment payload.",
        details: {
          provider: "Too small: expected string to have >=1 characters",
        },
      },
    });
  });
});
