import { DEFAULT_POLICY, policySchema, type Policy } from "@app/shared";
import { findLatestGlobalPolicy } from "../repositories/policy-repository";

/**
 * The teaching policy to apply for a student: their latest global policy (topic_id IS NULL,
 * highest version), or the neutral default for a new student with no policy yet (or a stored row
 * that no longer validates).
 *
 * NOT wired into any endpoint yet. Stage 9b will use it when a student asks for a personalized
 * view of a class material; class-level generation deliberately uses DEFAULT_POLICY instead.
 * The result carries only the four policy fields, never the student id.
 */
export async function getEffectivePolicy(studentId: string): Promise<Policy> {
  const row = await findLatestGlobalPolicy(studentId);
  if (!row) return DEFAULT_POLICY;
  const parsed = policySchema.safeParse({
    explanationLevel: row.explanationLevel,
    exampleFirst: row.exampleFirst,
    scaffolding: row.scaffolding,
    hintsEnabled: row.hintsEnabled,
  });
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}
