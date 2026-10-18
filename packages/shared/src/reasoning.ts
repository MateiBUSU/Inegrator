import { z } from "zod";
import { safeText } from "./safe-text";

// AI-graded open questions ("reasoning"): the student's free text is compared with the stored
// reference answer. One verdict per submission; the reference answer itself is never returned.

export const REASONING_VERDICTS = ["CORECT", "PARTIAL", "GRESIT"] as const;
export const reasoningVerdictValueSchema = z.enum(REASONING_VERDICTS);
export type ReasoningVerdictValue = z.infer<typeof reasoningVerdictValueSchema>;

/** Full, half or no credit. Deliberately coarse: no fine-grained percentages. */
export const REASONING_POINTS: Record<ReasoningVerdictValue, number> = {
  CORECT: 1,
  PARTIAL: 0.5,
  GRESIT: 0,
};

const MAX_FEEDBACK_CHARS = 3000;
const MAX_EXPLANATION_CHARS = 4000;

/** What a provider must return when grading one reasoning answer. */
export const reasoningVerdictSchema = z
  .object({
    verdict: reasoningVerdictValueSchema,
    /** Why: grounded in what the student wrote and how it differs from the reference answer. */
    feedback: safeText(MAX_FEEDBACK_CHARS).trim().min(1),
    /** A fresh explanation of the concept; required unless the answer is CORECT. */
    explanation: safeText(MAX_EXPLANATION_CHARS).trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.verdict !== "CORECT" && !value.explanation) {
      ctx.addIssue({
        code: "custom",
        path: ["explanation"],
        message: "an explanation is required unless the verdict is CORECT",
      });
    }
  });
export type ReasoningVerdict = z.infer<typeof reasoningVerdictSchema>;
