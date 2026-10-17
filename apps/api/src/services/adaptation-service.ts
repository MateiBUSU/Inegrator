import { policySchema } from "@app/shared";
import {
  addObjectiveTallies,
  listTopicAttempts,
  type ObjectiveTally,
} from "../repositories/learning-stats-repository";
import {
  findLatestPolicyVersion,
  insertTopicPolicyVersion,
} from "../repositories/policy-repository";
import { evaluatePolicy, type PolicyChange } from "./adaptive-policy";
import { getEffectivePolicy } from "./policy-service";

// The ONLY place that writes student_policies. It runs in the backend, after an attempt has been
// scored by the deterministic scorer; the AI layer has no import path to it (see the guard test
// in policy-unwired.test.ts) and its output never reaches a policy column.

const HISTORY_ATTEMPTS = 30;

export interface ScoredAnswerFact {
  objectiveId: string | null;
  isCorrect: boolean | null;
}

/** Graded answers per objective. Ungraded (null) answers and unlinked objectives are skipped. */
export function tallyObjectives(answers: readonly ScoredAnswerFact[]): ObjectiveTally[] {
  const byObjective = new Map<string, ObjectiveTally>();
  for (const answer of answers) {
    if (answer.objectiveId === null || answer.isCorrect === null) continue;
    const tally = byObjective.get(answer.objectiveId) ?? {
      objectiveId: answer.objectiveId,
      attempts: 0,
      correct: 0,
    };
    tally.attempts += 1;
    if (answer.isCorrect) tally.correct += 1;
    byObjective.set(answer.objectiveId, tally);
  }
  return [...byObjective.values()];
}

/**
 * After a scored attempt on a personal material: updates objective_stats, then checks whether
 * the teaching policy for this topic should change and, if so, appends a new policy version.
 * Returns the change that was stored, or null.
 */
export async function afterPersonalAttempt(input: {
  studentId: string;
  topicId: string;
  answers: readonly ScoredAnswerFact[];
}): Promise<PolicyChange | null> {
  await addObjectiveTallies(input.studentId, tallyObjectives(input.answers), new Date());

  const stored = await findLatestPolicyVersion(input.studentId, input.topicId);
  const storedPolicy = stored
    ? policySchema.safeParse({
        explanationLevel: stored.explanationLevel,
        exampleFirst: stored.exampleFirst,
        scaffolding: stored.scaffolding,
        hintsEnabled: stored.hintsEnabled,
      })
    : null;
  // A topic with no version yet starts from the student's global policy (or the default).
  const current = storedPolicy?.success
    ? storedPolicy.data
    : await getEffectivePolicy(input.studentId);

  const attempts = await listTopicAttempts(input.studentId, input.topicId, HISTORY_ATTEMPTS);
  const change = evaluatePolicy({
    current,
    lastVersionAt: stored?.createdAt ?? null,
    attempts,
  });
  if (!change) return null;

  const written = await insertTopicPolicyVersion({
    studentId: input.studentId,
    topicId: input.topicId,
    version: (stored?.version ?? 0) + 1,
    ...change.policy,
    reasonCode: change.reasonCode,
    note: change.note,
  });
  return written ? change : null;
}
