import type { Policy, PolicyReasonCode } from "@app/shared";
import { ADAPTATION, type AdaptationConfig } from "../config/adaptation";

// Pure rules that decide whether a student's teaching policy for a topic should change. No
// database, no clock, no AI: attempts in, an optional new policy out. The thresholds come from
// config/adaptation.ts. Only the backend (adaptation-service) writes the result to the database.

export interface ObservedAnswer {
  objectiveId: string | null;
  /** null = not graded (programming self-evaluation): never counted as right or wrong. */
  isCorrect: boolean | null;
}

export interface ObservedAttempt {
  submittedAt: Date;
  score: number;
  maxScore: number;
  answers: ObservedAnswer[];
}

export interface PolicyChange {
  policy: Policy;
  reasonCode: PolicyReasonCode;
  /** Romanian, with the real numbers that triggered the change. */
  note: string;
}

const EXPLANATION_LEVELS = ["basic", "standard", "advanced"] as const;
const SCAFFOLDING_LEVELS = ["low", "medium", "high"] as const;

const EXPLANATION_LABEL: Record<Policy["explanationLevel"], string> = {
  basic: "de bază",
  standard: "standard",
  advanced: "avansat",
};

/** Moves one step along an ordered list, stopping at either end. */
function shift<T extends string>(levels: readonly T[], current: T, by: 1 | -1): T {
  const index = levels.indexOf(current);
  const next = Math.min(levels.length - 1, Math.max(0, index + by));
  return levels[next] ?? current;
}

const EPSILON = 1e-9;

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function ruleA(
  current: Policy,
  fresh: ObservedAttempt[],
  config: AdaptationConfig,
): { fired: boolean; change: PolicyChange | null } {
  const window = fresh.slice(0, config.errorWindowAttempts);
  const wrongByObjective = new Map<string, number>();
  for (const attempt of window) {
    for (const answer of attempt.answers) {
      if (answer.isCorrect === false && answer.objectiveId !== null) {
        wrongByObjective.set(
          answer.objectiveId,
          (wrongByObjective.get(answer.objectiveId) ?? 0) + 1,
        );
      }
    }
  }
  const worst = Math.max(0, ...wrongByObjective.values());
  if (worst < config.wrongAnswersThreshold) return { fired: false, change: null };

  const policy: Policy = {
    ...current,
    scaffolding: shift(SCAFFOLDING_LEVELS, current.scaffolding, 1),
    exampleFirst: true,
  };
  // Already at the ceiling: the rule applied, but there is nothing left to raise.
  if (policy.scaffolding === current.scaffolding && policy.exampleFirst === current.exampleFirst) {
    return { fired: true, change: null };
  }
  return {
    fired: true,
    change: {
      policy,
      reasonCode: "REPEATED_OBJECTIVE_ERRORS",
      note:
        `${worst} greșeli la același obiectiv în ultimele ${window.length} încercări ` +
        `(prag ${config.wrongAnswersThreshold}). Sprijin: ${current.scaffolding} → ${policy.scaffolding}, ` +
        "exemplul vine primul.",
    },
  };
}

function ruleB(
  current: Policy,
  fresh: ObservedAttempt[],
  config: AdaptationConfig,
): { fired: boolean; change: PolicyChange | null } {
  // Attempts with nothing auto-scored (only programming questions) say nothing about accuracy.
  const recent = fresh.filter((attempt) => attempt.maxScore > 0).slice(0, config.accuracyAttempts);
  if (recent.length < config.accuracyAttempts) return { fired: false, change: null };

  const average =
    recent.reduce((sum, attempt) => sum + attempt.score / attempt.maxScore, 0) / recent.length;
  if (average + EPSILON < config.accuracyThreshold) return { fired: false, change: null };

  const policy: Policy = {
    ...current,
    explanationLevel: shift(EXPLANATION_LEVELS, current.explanationLevel, 1),
    scaffolding: shift(SCAFFOLDING_LEVELS, current.scaffolding, -1),
  };
  if (
    policy.explanationLevel === current.explanationLevel &&
    policy.scaffolding === current.scaffolding
  ) {
    return { fired: true, change: null };
  }
  return {
    fired: true,
    change: {
      policy,
      reasonCode: "HIGH_ACCURACY",
      note:
        `Media ultimelor ${recent.length} încercări: ${percent(average)} ` +
        `(prag ${percent(config.accuracyThreshold)}). ` +
        `Explicații: ${EXPLANATION_LABEL[current.explanationLevel]} → ${EXPLANATION_LABEL[policy.explanationLevel]}, ` +
        `sprijin: ${current.scaffolding} → ${policy.scaffolding}.`,
    },
  };
}

/**
 * Decides whether the policy for one student and topic should change.
 *
 * - `attempts` are the topic's quiz attempts, any order. Only attempts submitted after
 *   `lastVersionAt` (the creation time of the latest policy version for this topic, or null when
 *   there is none) count: data already acted on is never used twice.
 * - Nothing changes until at least `minNewObservations` graded answers have been recorded since
 *   that version, so one data point never moves the policy.
 * - Rule B (doing well: latest attempts average 80%+) is checked before Rule A (3+ misses on one
 *   objective), so a student who is doing well is never given more scaffolding. At most one rule
 *   fires, and a change moves each level by exactly one step.
 *
 * Returns null when the policy should stay as it is.
 */
export function evaluatePolicy(input: {
  current: Policy;
  lastVersionAt: Date | null;
  attempts: readonly ObservedAttempt[];
  config?: AdaptationConfig;
}): PolicyChange | null {
  const config = input.config ?? ADAPTATION;
  const fresh = input.attempts
    .filter((attempt) => input.lastVersionAt === null || attempt.submittedAt > input.lastVersionAt)
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

  const observations = fresh.reduce(
    (total, attempt) =>
      total + attempt.answers.filter((answer) => answer.isCorrect !== null).length,
    0,
  );
  if (observations < config.minNewObservations) return null;

  // Rule B first: a student averaging 80%+ over their latest attempts is not struggling, even if
  // a few misses on the same objective add up to Rule A's threshold (likely when a topic has a
  // single objective). A rule that fires but has nothing left to change still blocks the other.
  const b = ruleB(input.current, fresh, config);
  if (b.fired) return b.change;
  return ruleA(input.current, fresh, config).change;
}
