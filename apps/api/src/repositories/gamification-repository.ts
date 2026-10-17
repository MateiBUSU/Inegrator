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

// Points, streaks and goals count CLASS activity only. Personal practice (a student's own AI
// generated topics) stays private: it must not show up in a teacher's view of a student, and it
// must not be farmable by generating and re-submitting unlimited AI quizzes.
const classMaterial = { scope: "class" } as const;

export async function loadActivityFacts(studentId: string): Promise<ActivityFacts> {
  const [attempts, lessons, correct, incorrect] = await Promise.all([
    prisma.quizAttempt.findMany({
      where: { studentId, material: classMaterial },
      select: { submittedAt: true },
    }),
    prisma.lessonProgress.findMany({
      where: { studentId, material: classMaterial },
      select: { status: true, updatedAt: true },
    }),
    prisma.attemptAnswer.count({
      where: { isCorrect: true, attempt: { studentId, material: classMaterial } },
    }),
    prisma.attemptAnswer.count({
      where: { isCorrect: false, attempt: { studentId, material: classMaterial } },
    }),
  ]);
  return {
    attemptDates: attempts.map((a) => a.submittedAt),
    lessons,
    answers: { correct, incorrect },
  };
}
