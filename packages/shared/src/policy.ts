import { z } from "zod";

// A student's teaching policy: how content should be explained to them. Mirrors the
// student_policies columns (without ids, version or timestamps), so it carries no identity.
export const explanationLevelSchema = z.enum(["basic", "standard", "advanced"]);
export const scaffoldingSchema = z.enum(["low", "medium", "high"]);

export const policySchema = z.object({
  explanationLevel: explanationLevelSchema,
  exampleFirst: z.boolean(),
  scaffolding: scaffoldingSchema,
  hintsEnabled: z.boolean(),
});
export type Policy = z.infer<typeof policySchema>;

/** Neutral policy: used for class-level content (no single student in view) and new students. */
export const DEFAULT_POLICY: Policy = {
  explanationLevel: "standard",
  exampleFirst: false,
  scaffolding: "medium",
  hintsEnabled: true,
};
