import { z } from "zod";
import { gamificationStatsSchema } from "./gamification";

export const createClassRequestSchema = z.object({
  // No control characters: Postgres rejects NUL bytes in text, which would surface as a 500.
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (value) => [...value].every((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f),
      "control characters not allowed",
    ),
  grade: z.number().int().min(9).max(12),
});
export type CreateClassRequest = z.infer<typeof createClassRequestSchema>;

// Normalized and restricted to letters and digits; a well-formed but unknown code is a clean
// 404 from the service.
export const joinClassRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9]+$/),
});
export type JoinClassRequest = z.infer<typeof joinClassRequestSchema>;

export const classIdParamsSchema = z.object({ id: z.uuid() });
export const studentProgressParamsSchema = z.object({ id: z.uuid(), studentId: z.uuid() });

// What the owning teacher sees. Includes join_code.
export const teacherClassSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  grade: z.number().int(),
  join_code: z.string(),
  // The teacher's own writing-style notes for AI generation. Never part of any student response.
  style_notes: z.string().nullable(),
  created_at: z.string(),
});
export type TeacherClass = z.infer<typeof teacherClassSchema>;

// Roster entry: display name only, no email (data minimization for minors).
export const classStudentSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  joined_at: z.string(),
});
export type ClassStudent = z.infer<typeof classStudentSchema>;

export const teacherClassDetailSchema = teacherClassSchema.extend({
  students: z.array(classStudentSchema),
});
export type TeacherClassDetail = z.infer<typeof teacherClassDetailSchema>;

// What an enrolled student sees. Never includes join_code or other students.
export const studentClassSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  grade: z.number().int(),
  teacher_display_name: z.string(),
});
export type StudentClass = z.infer<typeof studentClassSchema>;

export const teacherClassListResponseSchema = z.object({ classes: z.array(teacherClassSchema) });
export const studentClassListResponseSchema = z.object({ classes: z.array(studentClassSchema) });
export const teacherClassResponseSchema = z.object({ class: teacherClassSchema });
export const teacherClassDetailResponseSchema = z.object({ class: teacherClassDetailSchema });
export const studentClassResponseSchema = z.object({ class: studentClassSchema });

export const studentProgressResponseSchema = z.object({
  student: z.object({ id: z.uuid(), display_name: z.string() }),
  // This one student's own stats, not a class-wide aggregate.
  gamification: gamificationStatsSchema,
  lesson_progress: z.array(
    z.object({
      material_id: z.uuid(),
      status: z.enum(["started", "completed"]),
      updated_at: z.string(),
    }),
  ),
  quiz_attempts: z.array(
    z.object({
      id: z.uuid(),
      material_id: z.uuid(),
      score: z.number(),
      max_score: z.number().int(),
      submitted_at: z.string(),
    }),
  ),
});
export type StudentProgressResponse = z.infer<typeof studentProgressResponseSchema>;
