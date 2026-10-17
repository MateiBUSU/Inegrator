import type {
  StudentClass,
  StudentProgressResponse,
  TeacherClass,
  TeacherClassDetail,
} from "@app/shared";
import { HttpError } from "../middleware/error-handler";
import {
  JoinCodeTakenError,
  UnknownUserError,
  createClass,
  ensureEnrollment,
  findClassByJoinCode,
  findClassById,
  findEnrolledStudent,
  isEnrolled,
  listClassesByStudent,
  listClassesByTeacher,
  listRoster,
  type ClassRecord,
} from "../repositories/class-repository";
import { listLessonProgress, listQuizAttempts } from "../repositories/progress-repository";
import { generateJoinCode } from "./join-code";
import type { AuthContext } from "./token-service";

const MAX_JOIN_CODE_ATTEMPTS = 8;

// Authorization failures and missing resources are deliberately indistinguishable (404),
// so callers cannot probe which class ids exist.
function classNotFound(): HttpError {
  return new HttpError(404, "CLASS_NOT_FOUND", "Clasa nu a fost găsită.");
}

// A valid token for a user that no longer exists is an authentication problem, not a 500.
function sessionUserGone(): HttpError {
  return new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară.");
}

function toTeacherClass(c: ClassRecord): TeacherClass {
  return {
    id: c.id,
    name: c.name,
    grade: c.grade,
    join_code: c.joinCode,
    created_at: c.createdAt.toISOString(),
  };
}

function toStudentClass(c: ClassRecord): StudentClass {
  return {
    id: c.id,
    name: c.name,
    grade: c.grade,
    teacher_display_name: c.teacher.displayName,
  };
}

/** The class, only if it belongs to this teacher. */
async function loadOwnedClass(teacherId: string, classId: string): Promise<ClassRecord> {
  const found = await findClassById(classId);
  if (!found || found.teacherId !== teacherId) throw classNotFound();
  return found;
}

export async function createTeacherClass(
  auth: AuthContext,
  input: { name: string; grade: number },
): Promise<TeacherClass> {
  // The unique index is the source of truth: insert and retry on collision (race-safe).
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    try {
      const created = await createClass({
        teacherId: auth.userId,
        name: input.name,
        grade: input.grade,
        joinCode: generateJoinCode(),
      });
      return toTeacherClass(created);
    } catch (err) {
      if (err instanceof JoinCodeTakenError) continue;
      if (err instanceof UnknownUserError) throw sessionUserGone();
      throw err;
    }
  }
  throw new HttpError(503, "JOIN_CODE_UNAVAILABLE", "Nu s-a putut genera un cod de clasă.");
}

export async function listClasses(
  auth: AuthContext,
): Promise<
  { role: "teacher"; classes: TeacherClass[] } | { role: "student"; classes: StudentClass[] }
> {
  if (auth.role === "teacher") {
    const classes = await listClassesByTeacher(auth.userId);
    return { role: "teacher", classes: classes.map(toTeacherClass) };
  }
  const classes = await listClassesByStudent(auth.userId);
  return { role: "student", classes: classes.map(toStudentClass) };
}

export async function getClass(
  auth: AuthContext,
  classId: string,
): Promise<
  { role: "teacher"; class: TeacherClassDetail } | { role: "student"; class: StudentClass }
> {
  const found = await findClassById(classId);
  if (!found) throw classNotFound();

  if (auth.role === "teacher") {
    if (found.teacherId !== auth.userId) throw classNotFound();
    const roster = await listRoster(found.id);
    return {
      role: "teacher",
      class: {
        ...toTeacherClass(found),
        students: roster.map((entry) => ({
          id: entry.studentId,
          display_name: entry.displayName,
          joined_at: entry.joinedAt.toISOString(),
        })),
      },
    };
  }

  if (!(await isEnrolled(found.id, auth.userId))) throw classNotFound();
  return { role: "student", class: toStudentClass(found) };
}

/** Idempotent: joining a class you are already in returns the same result. */
export async function joinClass(auth: AuthContext, code: string): Promise<StudentClass> {
  const found = await findClassByJoinCode(code);
  if (!found) throw new HttpError(404, "INVALID_JOIN_CODE", "Cod de clasă invalid.");
  try {
    await ensureEnrollment(found.id, auth.userId);
  } catch (err) {
    if (err instanceof UnknownUserError) throw sessionUserGone();
    throw err;
  }
  return toStudentClass(found);
}

export async function getStudentProgress(
  auth: AuthContext,
  classId: string,
  studentId: string,
): Promise<StudentProgressResponse> {
  const owned = await loadOwnedClass(auth.userId, classId);
  const student = await findEnrolledStudent(owned.id, studentId);
  if (!student) throw new HttpError(404, "STUDENT_NOT_FOUND", "Elevul nu face parte din clasă.");

  const [lessons, attempts] = await Promise.all([
    listLessonProgress(owned.id, student.id),
    listQuizAttempts(owned.id, student.id),
  ]);
  return {
    student: { id: student.id, display_name: student.displayName },
    lesson_progress: lessons.map((l) => ({
      material_id: l.materialId,
      status: l.status,
      updated_at: l.updatedAt.toISOString(),
    })),
    quiz_attempts: attempts.map((a) => ({
      id: a.id,
      material_id: a.materialId,
      score: a.score,
      max_score: a.maxScore,
      submitted_at: a.submittedAt.toISOString(),
    })),
  };
}
