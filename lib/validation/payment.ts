import { z } from "zod";

const payPayloadSchema = z.object({
  provider: z.string().trim().min(1).max(50).default("mock"),
  plan: z.string().trim().min(1).max(50).optional(),
  externalRef: z.string().trim().min(1).max(100).optional(),
});

export type PayPayload = z.infer<typeof payPayloadSchema>;

export function parsePayPayload(input: unknown): PayPayload {
  return payPayloadSchema.parse(input);
}
