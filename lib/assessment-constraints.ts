export const assessmentConstraints = {
  age: {
    min: 18,
    max: 80,
  },
  heightCm: {
    min: 100,
    max: 250,
  },
  weightKg: {
    min: 30,
    max: 220,
  },
} as const;

export const assessmentValidationCopy = {
  age: "Please enter a realistic adult age.",
  height: "That height doesn't look right. Please check it.",
  weight: "That weight doesn't look realistic. Please check it.",
  targetWeight: "That target weight doesn't look realistic. Please check it.",
  weightLossTarget:
    "Your target weight should be lower than your current weight for a weight-loss goal.",
} as const;
