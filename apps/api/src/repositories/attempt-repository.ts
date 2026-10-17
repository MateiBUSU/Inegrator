import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma-client";

export interface AttemptRecord {
  id: string;
  studentId: string;
  materialId: string;
  submittedAt: Date;
  score: number;
  maxScore: number;
}

export interface NewAttemptAnswer {
  questionId: string;
  answer: unknown;
  /** null = not graded (programming self-evaluation). */
  isCorrect: boolean | null;
  /** Only set when it refers to a row of the objectives catalogue. */
  objectiveId: string | null;
}

/** Which of these ids are rows of the objectives catalogue (material-local ids are not). */
export async function findExistingObjectiveIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.objective.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

/** One nested create: the attempt and its answers are written together or not at all. */
export function createAttempt(data: {
  studentId: string;
  materialId: string;
  score: number;
  maxScore: number;
  answers: NewAttemptAnswer[];
}): Promise<AttemptRecord> {
  return prisma.quizAttempt.create({
    data: {
      studentId: data.studentId,
      materialId: data.materialId,
      score: data.score,
      maxScore: data.maxScore,
      answers: {
        create: data.answers.map((a) => ({
          questionId: a.questionId,
          answer: a.answer as Prisma.InputJsonValue,
          isCorrect: a.isCorrect,
          objectiveId: a.objectiveId,
        })),
      },
    },
  });
}

export interface AttemptWithAnswers extends AttemptRecord {
  answers: { questionId: string; answer: unknown }[];
}

export function findAttemptById(id: string): Promise<AttemptWithAnswers | null> {
  return prisma.quizAttempt.findUnique({
    where: { id },
    include: { answers: { select: { questionId: true, answer: true } } },
  });
}
