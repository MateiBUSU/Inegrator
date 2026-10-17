import type { ExplanationStrategy, Question } from "@app/shared";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma-client";

// Adaptive practice (class objectives). Every query names the student, so a student can only ever
// read or change their own rows.

export type ObjectiveProgressStatusValue = "not_started" | "struggling" | "mastered";

export interface PracticeObjectiveRecord {
  id: string;
  text: string;
  chapterTitle: string;
  subjectTitle: string;
  language: "cpp" | "python";
}

export interface ObjectiveProgressRecord {
  objectiveId: string;
  status: ObjectiveProgressStatusValue;
  attemptsCount: number;
  strategiesTried: ExplanationStrategy[];
  currentExplanation: string | null;
  helpRequestedAt: Date | null;
  updatedAt: Date;
}

export interface PracticeExerciseRecord {
  id: string;
  objectiveId: string;
  /** Contains the answer key: services must pass it through toStudentQuestion before sending. */
  question: unknown;
  answeredAt: Date | null;
}

/** Another request answered the same exercise first. */
export class ExerciseAlreadyAnsweredError extends Error {
  constructor() {
    super("Exercise already answered");
  }
}

const progressSelect = {
  objectiveId: true,
  status: true,
  attemptsCount: true,
  strategiesTried: true,
  currentExplanation: true,
  helpRequestedAt: true,
  updatedAt: true,
} as const;

const exerciseSelect = { id: true, objectiveId: true, question: true, answeredAt: true } as const;

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * A class objective this student may practice: it belongs to a chapter that has a published
 * material assigned to a class the student is enrolled in. Personal-topic objectives (no chapter)
 * never match.
 */
export async function findPracticeObjective(
  studentId: string,
  objectiveId: string,
): Promise<PracticeObjectiveRecord | null> {
  const row = await prisma.objective.findFirst({
    where: {
      id: objectiveId,
      chapterId: { not: null },
      chapter: {
        materials: {
          some: {
            scope: "class",
            status: "published",
            assignments: { some: { class: { enrollments: { some: { studentId } } } } },
          },
        },
      },
    },
    select: {
      id: true,
      text: true,
      chapter: { select: { title: true, subject: { select: { title: true, language: true } } } },
    },
  });
  if (!row?.chapter) return null;
  return {
    id: row.id,
    text: row.text,
    chapterTitle: row.chapter.title,
    subjectTitle: row.chapter.subject.title,
    language: row.chapter.subject.language,
  };
}

export function findProgress(
  studentId: string,
  objectiveId: string,
): Promise<ObjectiveProgressRecord | null> {
  return prisma.objectiveProgress.findUnique({
    where: { studentId_objectiveId: { studentId, objectiveId } },
    select: progressSelect,
  });
}

export function findPendingExercise(
  studentId: string,
  objectiveId: string,
): Promise<PracticeExerciseRecord | null> {
  return prisma.practiceExercise.findFirst({
    where: { studentId, objectiveId, answeredAt: null },
    orderBy: { createdAt: "desc" },
    select: exerciseSelect,
  });
}

export function findExercise(
  studentId: string,
  objectiveId: string,
  exerciseId: string,
): Promise<PracticeExerciseRecord | null> {
  return prisma.practiceExercise.findFirst({
    where: { id: exerciseId, studentId, objectiveId },
    select: exerciseSelect,
  });
}

/** Creates the progress row if the student has none yet, then stores the exercise. */
export async function createExerciseEnsuringProgress(data: {
  studentId: string;
  objectiveId: string;
  question: Question;
}): Promise<{ exercise: PracticeExerciseRecord; progress: ObjectiveProgressRecord }> {
  const [progress, exercise] = await prisma.$transaction([
    prisma.objectiveProgress.upsert({
      where: {
        studentId_objectiveId: { studentId: data.studentId, objectiveId: data.objectiveId },
      },
      create: { studentId: data.studentId, objectiveId: data.objectiveId },
      update: {},
      select: progressSelect,
    }),
    prisma.practiceExercise.create({
      data: {
        studentId: data.studentId,
        objectiveId: data.objectiveId,
        question: toJson(data.question),
      },
      select: exerciseSelect,
    }),
  ]);
  return { exercise, progress };
}

/**
 * Records one answered exercise, in one transaction: marks the exercise answered (only once),
 * logs the attempt, updates the progress row and, for a wrong answer that is not capped, stores
 * the next exercise. A second request for the same exercise throws ExerciseAlreadyAnsweredError.
 */
export function recordPracticeResult(data: {
  studentId: string;
  objectiveId: string;
  exerciseId: string;
  exerciseContent: string;
  submittedAnswer: string;
  isCorrect: boolean;
  feedbackText: string | null;
  /** The strategy that preceded the exercise; null on the very first attempt. */
  strategyUsed: ExplanationStrategy | null;
  progress: {
    status: ObjectiveProgressStatusValue;
    attemptsCount: number;
    strategiesTried: ExplanationStrategy[];
    currentExplanation: string | null;
  };
  nextQuestion: Question | null;
}): Promise<{ progress: ObjectiveProgressRecord; nextExercise: PracticeExerciseRecord | null }> {
  return prisma.$transaction(async (tx) => {
    const marked = await tx.practiceExercise.updateMany({
      where: { id: data.exerciseId, studentId: data.studentId, answeredAt: null },
      data: { answeredAt: new Date() },
    });
    if (marked.count === 0) throw new ExerciseAlreadyAnsweredError();

    await tx.practiceAttempt.create({
      data: {
        studentId: data.studentId,
        objectiveId: data.objectiveId,
        exerciseId: data.exerciseId,
        exerciseContent: data.exerciseContent,
        submittedAnswer: data.submittedAnswer,
        isCorrect: data.isCorrect,
        feedbackText: data.feedbackText,
        strategyUsed: data.strategyUsed,
      },
    });
    const progress = await tx.objectiveProgress.update({
      where: {
        studentId_objectiveId: { studentId: data.studentId, objectiveId: data.objectiveId },
      },
      data: data.progress,
      select: progressSelect,
    });
    const nextExercise = data.nextQuestion
      ? await tx.practiceExercise.create({
          data: {
            studentId: data.studentId,
            objectiveId: data.objectiveId,
            question: toJson(data.nextQuestion),
          },
          select: exerciseSelect,
        })
      : null;
    return { progress, nextExercise };
  });
}

// --- teacher side ----------------------------------------------------------------------------

export interface MaterialStudentRecord {
  studentId: string;
  displayName: string;
  className: string;
}

/** Every student enrolled in a class this material is assigned to (one entry per class). */
export async function listStudentsOfMaterial(materialId: string): Promise<MaterialStudentRecord[]> {
  const rows = await prisma.enrollment.findMany({
    where: { class: { assignments: { some: { materialId } } } },
    select: {
      studentId: true,
      student: { select: { displayName: true } },
      class: { select: { name: true } },
    },
    orderBy: [{ student: { displayName: "asc" } }, { studentId: "asc" }],
  });
  return rows.map((row) => ({
    studentId: row.studentId,
    displayName: row.student.displayName,
    className: row.class.name,
  }));
}

/** The raw progress rows of these students on these objectives: one row per pair, if any. */
export function listProgressForStudents(
  studentIds: readonly string[],
  objectiveIds: readonly string[],
): Promise<(ObjectiveProgressRecord & { studentId: string })[]> {
  if (studentIds.length === 0 || objectiveIds.length === 0) return Promise.resolve([]);
  return prisma.objectiveProgress.findMany({
    where: { studentId: { in: [...studentIds] }, objectiveId: { in: [...objectiveIds] } },
    select: { ...progressSelect, studentId: true },
  });
}

/**
 * Sets help_requested_at once: a second request keeps the first timestamp. Returns the row, or
 * null if the student has no progress row.
 */
export async function markHelpRequested(
  studentId: string,
  objectiveId: string,
): Promise<ObjectiveProgressRecord | null> {
  await prisma.objectiveProgress.updateMany({
    where: { studentId, objectiveId, helpRequestedAt: null },
    data: { helpRequestedAt: new Date() },
  });
  return findProgress(studentId, objectiveId);
}
