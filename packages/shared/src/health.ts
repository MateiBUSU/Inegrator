import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
