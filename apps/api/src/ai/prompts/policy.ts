import { DEFAULT_POLICY, policySchema, type Policy } from "@app/shared";

/**
 * Keeps only the four policy fields and drops everything else. A caller may hand over a whole
 * database row (with student id, topic id, version...); none of that can reach a prompt.
 * An invalid policy falls back to the neutral default.
 */
export function normalizePolicy(raw: unknown): Policy {
  const parsed = policySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}

const EXPLANATION: Record<Policy["explanationLevel"], string> = {
  basic:
    "Use short, simple explanations with everyday analogies. Avoid jargon and define every technical term the first time it appears.",
  standard:
    "Use clear explanations at the level of the school curriculum, introducing terminology gradually.",
  advanced:
    "Use concise, precise explanations. Assume the student is comfortable with terminology; include edge cases and the reasoning behind them.",
};

const SCAFFOLDING: Record<Policy["scaffolding"], string> = {
  low: "Give minimal guidance: state the task and let the student work out the steps.",
  medium: "Give a brief outline of the approach and leave the details to the student.",
  high: "Break the solution into small guided steps, presented one step at a time.",
};

/**
 * Deterministic translation of a policy into explicit instructions for the model.
 * Always four lines, in a fixed order: explanation level, example order, scaffolding, hints.
 */
export function policyInstructions(rawPolicy: unknown): string[] {
  const policy = normalizePolicy(rawPolicy);
  return [
    EXPLANATION[policy.explanationLevel],
    policy.exampleFirst
      ? "Show a worked example before the abstract explanation."
      : "Start with the explanation, then illustrate it with a worked example.",
    SCAFFOLDING[policy.scaffolding],
    policy.hintsEnabled
      ? "Hints are allowed: write explanations so they can be revealed progressively, hint first."
      : "Hints are disabled: give complete explanations directly.",
  ];
}
