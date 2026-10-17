import { prisma } from "./prisma-client";

export interface ObjectiveTally {
  objectiveId: string;
  /** Graded answers on this objective in the attempt. */
  attempts: number;
  correct: number;
}

/**
 * Adds one attempt's tallies to objective_stats (one row per student and objective). All rows are
 * written together or not at all. hints_used is left alone: there is no hint feature yet.
 */
export async function addObjectiveTallies(
  studentId: string,
  tallies: readonly ObjectiveTally[],
  practicedAt: Date,
): Promise<void> {
  if (tallies.length === 0) return;
  await prisma.$transaction(
    tallies.map((tally) =>
      prisma.objectiveStat.upsert({
        where: { studentId_objectiveId: { studentId, objectiveId: tally.objectiveId } },
        create: {
          studentId,
          objectiveId: tally.objectiveId,
          attempts: tally.attempts,
          correct: tally.correct,
          hintsUsed: 0,
          lastPracticedAt: practicedAt,
        },
        update: {
          attempts: { increment: tally.attempts },
          correct: { increment: tally.correct },
          lastPracticedAt: practicedAt,
        },
      }),
    ),
  );
}

export interface TopicAttemptRecord {
  submittedAt: Date;
  score: number;
  maxScore: number;
  answers: { objectiveId: string | null; isCorrect: boolean | null }[];
}

/** The student's most recent attempts on the personal materials of one topic, newest first. */
export function listTopicAttempts(
  studentId: string,
  topicId: string,
  take: number,
): Promise<TopicAttemptRecord[]> {
  return prisma.quizAttempt.findMany({
    where: { studentId, material: { scope: "personal", topicId } },
    orderBy: { submittedAt: "desc" },
    take,
    select: {
      submittedAt: true,
      score: true,
      maxScore: true,
      answers: { select: { objectiveId: true, isCorrect: true } },
    },
  });
}
