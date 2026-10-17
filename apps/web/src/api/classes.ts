import {
  studentClassListResponseSchema,
  studentClassResponseSchema,
  studentProgressResponseSchema,
  teacherClassDetailResponseSchema,
  teacherClassListResponseSchema,
  teacherClassResponseSchema,
  type CreateClassRequest,
  type Role,
  type StudentClass,
  type StudentProgressResponse,
  type TeacherClass,
  type TeacherClassDetail,
} from "@app/shared";
import { request } from "./client";

// Class endpoints use snake_case (join_code, created_at, teacher_display_name). The same URLs
// answer with a different shape depending on the signed-in role, hence the role parameters.

/** GET /api/classes: a teacher's own classes. */
export async function listClasses(role: "teacher"): Promise<TeacherClass[]>;
/** GET /api/classes: the classes a student is enrolled in. */
export async function listClasses(role: "student"): Promise<StudentClass[]>;
export async function listClasses(role: Role): Promise<TeacherClass[] | StudentClass[]> {
  if (role === "teacher") {
    const { classes } = await request("GET", "/classes", {
      schema: teacherClassListResponseSchema,
    });
    return classes;
  }
  const { classes } = await request("GET", "/classes", { schema: studentClassListResponseSchema });
  return classes;
}

/** POST /api/classes (teacher) */
export async function createClass(body: CreateClassRequest): Promise<TeacherClass> {
  const { class: created } = await request("POST", "/classes", {
    body,
    schema: teacherClassResponseSchema,
  });
  return created;
}

/** GET /api/classes/:id: the owning teacher's full view (join code, roster). */
export async function getClass(role: "teacher", id: string): Promise<TeacherClassDetail>;
/** GET /api/classes/:id: an enrolled student's view (no join code, no roster). */
export async function getClass(role: "student", id: string): Promise<StudentClass>;
export async function getClass(role: Role, id: string): Promise<TeacherClassDetail | StudentClass> {
  const path = `/classes/${encodeURIComponent(id)}`;
  if (role === "teacher") {
    const { class: detail } = await request("GET", path, {
      schema: teacherClassDetailResponseSchema,
    });
    return detail;
  }
  const { class: detail } = await request("GET", path, { schema: studentClassResponseSchema });
  return detail;
}

/** POST /api/classes/join (student). Joining twice is fine. */
export async function joinClass(code: string): Promise<StudentClass> {
  const { class: joined } = await request("POST", "/classes/join", {
    body: { code },
    schema: studentClassResponseSchema,
  });
  return joined;
}

/** GET /api/classes/:id/students/:studentId/progress (owning teacher) */
export function getStudentProgress(
  classId: string,
  studentId: string,
): Promise<StudentProgressResponse> {
  return request(
    "GET",
    `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/progress`,
    { schema: studentProgressResponseSchema },
  );
}
