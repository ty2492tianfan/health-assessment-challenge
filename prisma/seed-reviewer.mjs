import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const freeSessionId = "sess_reviewer_free_demo";
const paidSessionId = "sess_reviewer_paid_demo";

const resultData = {
  bmi: new Prisma.Decimal("23.03"),
  bmiCategory: "NORMAL",
  dailyCalorieTarget: 1537,
  targetDate: new Date("2026-12-06T00:00:00.000Z"),
  projectedCurve: [
    { date: "2026-08-30", weightKg: 65 },
    { date: "2026-12-06", weightKg: 60 },
  ],
  summaryText:
    "Your BMI is currently within the normal range. A moderate calorie deficit can help you work toward your goal at a steady pace.",
  generatedAt: new Date(),
};

async function upsertReviewerSession(sessionId, subscriptionStatus) {
  const user = await prisma.user.upsert({
    where: { sessionId },
    create: {
      sessionId,
      subscriptionStatus,
      assessmentDraft: {
        create: {
          mainGoal: "LOSE_WEIGHT",
          gender: "FEMALE",
          age: 26,
          heightCm: 168,
          weightKg: new Prisma.Decimal("65"),
          targetWeightKg: new Prisma.Decimal("60"),
          exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
          currentStep: "review",
        },
      },
    },
    update: {
      subscriptionStatus,
    },
  });

  await prisma.assessmentDraft.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      mainGoal: "LOSE_WEIGHT",
      gender: "FEMALE",
      age: 26,
      heightCm: 168,
      weightKg: new Prisma.Decimal("65"),
      targetWeightKg: new Prisma.Decimal("60"),
      exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      currentStep: "review",
    },
    update: {
      mainGoal: "LOSE_WEIGHT",
      gender: "FEMALE",
      age: 26,
      heightCm: 168,
      weightKg: new Prisma.Decimal("65"),
      targetWeightKg: new Prisma.Decimal("60"),
      exerciseFrequency: "SEVERAL_TIMES_A_WEEK",
      currentStep: "review",
    },
  });

  await prisma.assessmentResult.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...resultData,
    },
    update: resultData,
  });

  return user;
}

async function main() {
  const freeUser = await upsertReviewerSession(freeSessionId, "INACTIVE");
  const paidUser = await upsertReviewerSession(paidSessionId, "ACTIVE");

  console.log("Reviewer sessions ready:");
  console.log(`  unpaid  ${freeUser.sessionId}`);
  console.log(`  paid    ${paidUser.sessionId}`);
  console.log("");
  console.log("Compare:");
  console.log(
    `  curl -s "$APP_URL/api/results" -H "x-session-id: ${freeSessionId}"`,
  );
  console.log(
    `  curl -s "$APP_URL/api/results" -H "x-session-id: ${paidSessionId}"`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
