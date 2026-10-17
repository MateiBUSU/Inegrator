import { prisma } from "./prisma-client";

/** The raw facts the stats are computed from. All of them belong to one student. */
export interface ActivityFacts {
  /** submitted_at of every quiz attempt. */
  attemptDates: Date[];
  /** Every lesson_progress row (one per lesson): which of them count is decided in the service. */
  lessons: { status: "started" | "completed"; updatedAt: Date }[];
  /** Attempt answers by correctness. */
  answers: { correct: number; incorrect: number };
}

export async function loadActivityFacts(studentId: string): Promise<ActivityFacts> {
  const [attempts, lessons, correct, incorrect] = await Promise.all([
    prisma.quizAttempt.findMany({ where: { studentId }, select: { submittedAt: true } }),
    prisma.lessonProgress.findMany({
      where: { studentId },
      select: { status: true, updatedAt: true },
    }),
    prisma.attemptAnswer.count({ where: { isCorrect: true, attempt: { studentId } } }),
    prisma.attemptAnswer.count({ where: { isCorrect: false, attempt: { studentId } } }),
  ]);
  return {
    attemptDates: attempts.map((a) => a.submittedAt),
    lessons,
    answers: { correct, incorrect },
  };
}
