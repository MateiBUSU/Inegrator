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
