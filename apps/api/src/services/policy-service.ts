import {
  DEFAULT_POLICY,
  POLICY_REASON_CODES,
  policySchema,
  type Policy,
  type PolicyReasonCode,
  type TopicPolicyResponse,
} from "@app/shared";
import {
  findLatestGlobalPolicy,
  findLatestPolicyVersion,
  type PolicyRecord,
} from "../repositories/policy-repository";

/** The four policy fields of a stored row, or null if the row no longer validates. */
function validPolicy(row: PolicyRecord): Policy | null {
  const parsed = policySchema.safeParse({
    explanationLevel: row.explanationLevel,
    exampleFirst: row.exampleFirst,
    scaffolding: row.scaffolding,
    hintsEnabled: row.hintsEnabled,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The teaching policy to apply for a student: their latest global policy (topic_id IS NULL,
 * highest version), or the neutral default for a new student with no policy yet (or a stored row
 * that no longer validates).
 *
 * Class-level generation deliberately uses DEFAULT_POLICY instead. The result carries only the
 * four policy fields, never the student id.
 */
export async function getEffectivePolicy(studentId: string): Promise<Policy> {
  const row = await findLatestGlobalPolicy(studentId);
  return (row && validPolicy(row)) ?? DEFAULT_POLICY;
}

const isReasonCode = (value: string | null): value is PolicyReasonCode =>
  POLICY_REASON_CODES.some((code) => code === value);

/**
 * The current policy for one student and topic: the topic's highest version, else the student's
 * global policy, else the built-in default. The caller has already checked topic ownership.
 */
export async function getTopicPolicy(
  studentId: string,
  topicId: string,
): Promise<TopicPolicyResponse> {
  const topicRow = await findLatestPolicyVersion(studentId, topicId);
  const topicPolicy = topicRow && validPolicy(topicRow);
  if (topicRow && topicPolicy) {
    return {
      policy: topicPolicy,
      version: topicRow.version,
      source: "topic",
      reasonCode: isReasonCode(topicRow.reasonCode) ? topicRow.reasonCode : null,
      note: topicRow.note,
    };
  }
  const globalRow = await findLatestPolicyVersion(studentId, null);
  const globalPolicy = globalRow && validPolicy(globalRow);
  if (globalRow && globalPolicy) {
    return {
      policy: globalPolicy,
      version: globalRow.version,
      source: "global",
      reasonCode: isReasonCode(globalRow.reasonCode) ? globalRow.reasonCode : null,
      note: globalRow.note,
    };
  }
  return { policy: DEFAULT_POLICY, version: null, source: "default", reasonCode: null, note: null };
}
