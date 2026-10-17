import { isForeignKeyViolation, isUniqueViolation } from "./prisma-errors";
import { prisma } from "./prisma-client";

export interface ClassRecord {
  id: string;
  teacherId: string;
  name: string;
  grade: number;
  joinCode: string;
  createdAt: Date;
  teacher: { displayName: string };
}

export interface RosterEntry {
  studentId: string;
  displayName: string;
  joinedAt: Date;
}

export class JoinCodeTakenError extends Error {
  constructor() {
    super("Join code already in use");
  }
}

/** The acting user no longer exists (e.g. a valid token for a deleted account). */
export class UnknownUserError extends Error {
  constructor() {
    super("User does not exist");
  }
}

const withTeacher = { teacher: { select: { displayName: true } } } as const;

export async function createClass(data: {
  teacherId: string;
  name: string;
  grade: number;
  joinCode: string;
}): Promise<ClassRecord> {
  try {
    return await prisma.class.create({ data, include: withTeacher });
  } catch (err) {
    // classes.join_code is the only unique column besides the id
    if (isUniqueViolation(err)) throw new JoinCodeTakenError();
    if (isForeignKeyViolation(err)) throw new UnknownUserError();
    throw err;
  }
}

export function findClassById(id: string): Promise<ClassRecord | null> {
  return prisma.class.findUnique({ where: { id }, include: withTeacher });
}

export function findClassByJoinCode(joinCode: string): Promise<ClassRecord | null> {
  return prisma.class.findUnique({ where: { joinCode }, include: withTeacher });
}

export function listClassesByTeacher(teacherId: string): Promise<ClassRecord[]> {
  return prisma.class.findMany({
    where: { teacherId },
    include: withTeacher,
    orderBy: { createdAt: "desc" },
  });
}

export function listClassesByStudent(studentId: string): Promise<ClassRecord[]> {
  return prisma.class.findMany({
    where: { enrollments: { some: { studentId } } },
    include: withTeacher,
    orderBy: { createdAt: "desc" },
  });
}

/** Owner-scoped write; false if the class does not exist or is not this teacher's. */
export async function setStyleNotes(
  classId: string,
  teacherId: string,
  styleNotes: string | null,
): Promise<boolean> {
  const result = await prisma.class.updateMany({
    where: { id: classId, teacherId },
    data: { styleNotes },
  });
  return result.count === 1;
}

export async function isEnrolled(classId: string, studentId: string): Promise<boolean> {
  const row = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
    select: { classId: true },
  });
  return row !== null;
}

/** Idempotent and race-safe: ON CONFLICT DO NOTHING on the composite primary key. */
export async function ensureEnrollment(classId: string, studentId: string): Promise<void> {
  try {
    await prisma.enrollment.createMany({ data: [{ classId, studentId }], skipDuplicates: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new UnknownUserError();
    throw err;
  }
}

export async function listRoster(classId: string): Promise<RosterEntry[]> {
  const rows = await prisma.enrollment.findMany({
    where: { classId },
    include: { student: { select: { displayName: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return rows.map((row) => ({
    studentId: row.studentId,
    displayName: row.student.displayName,
    joinedAt: row.joinedAt,
  }));
}

export async function findEnrolledStudent(
  classId: string,
  studentId: string,
): Promise<{ id: string; displayName: string } | null> {
  const row = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
    include: { student: { select: { id: true, displayName: true } } },
  });
  return row ? row.student : null;
}
