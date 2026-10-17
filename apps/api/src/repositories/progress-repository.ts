import { prisma } from "./prisma-client";

export interface LessonProgressRecord {
  materialId: string;
  status: "started" | "completed";
  updatedAt: Date;
}

export interface QuizAttemptRecord {
  id: string;
  materialId: string;
  score: number;
  maxScore: number;
  submittedAt: Date;
}

// Only materials assigned to this class count as progress "in that class".
const assignedToClass = (classId: string) => ({ assignments: { some: { classId } } });

export function listLessonProgress(
  classId: string,
  studentId: string,
): Promise<LessonProgressRecord[]> {
  return prisma.lessonProgress.findMany({
    where: { studentId, material: assignedToClass(classId) },
    select: { materialId: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export function listQuizAttempts(classId: string, studentId: string): Promise<QuizAttemptRecord[]> {
  return prisma.quizAttempt.findMany({
    where: { studentId, material: assignedToClass(classId) },
    select: { id: true, materialId: true, score: true, maxScore: true, submittedAt: true },
    orderBy: { submittedAt: "desc" },
  });
}

export interface ProgressRecord {
  materialId: string;
  status: "started" | "completed";
  updatedAt: Date;
}

const progressSelect = { materialId: true, status: true, updatedAt: true } as const;

/**
 * Records progress without ever rewriting a completed row. updated_at is the completion time
 * the gamification streak is computed from, so re-marking a lesson must not move it.
 *  - started: only creates the row; an existing row (started or completed) is left untouched.
 *  - completed: promotes a started row, or creates the row; an already completed row is untouched.
 */
export async function recordProgress(
  studentId: string,
  materialId: string,
  status: "started" | "completed",
): Promise<ProgressRecord> {
  // Insert first, promote second: if a concurrent request created the row as "started" in
  // between, the insert is skipped and the promote below still records the completion.
  await prisma.lessonProgress.createMany({
    data: [{ studentId, materialId, status }],
    skipDuplicates: true,
  });
  if (status === "completed") {
    await prisma.lessonProgress.updateMany({
      where: { studentId, materialId, status: "started" },
      data: { status: "completed" },
    });
  }
  return prisma.lessonProgress.findUniqueOrThrow({
    where: { studentId_materialId: { studentId, materialId } },
    select: progressSelect,
  });
}

export function listProgressByStudent(studentId: string): Promise<ProgressRecord[]> {
  return prisma.lessonProgress.findMany({
    where: { studentId },
    select: progressSelect,
    orderBy: { updatedAt: "desc" },
  });
}
