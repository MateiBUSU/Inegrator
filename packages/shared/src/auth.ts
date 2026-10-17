import { z } from "zod";

export const roleSchema = z.enum(["student", "teacher"]);
export type Role = z.infer<typeof roleSchema>;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  role: roleSchema,
  display_name: z.string().trim().min(1).max(60),
  // Required when role is "teacher"; checked in the backend against TEACHER_SECRET.
  teacher_secret: z.string().max(256).optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Public user shape: never includes the password hash.
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: roleSchema,
  display_name: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({ user: authUserSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;
