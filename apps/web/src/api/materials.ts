import {
  assignMaterialResponseSchema,
  generateMaterialResponseSchema,
  materialListResponseSchema,
  objectiveProgressOverviewResponseSchema,
  studentMaterialResponseSchema,
  subjectsResponseSchema,
  teacherMaterialResponseSchema,
  type createMaterialRequestSchema,
  type generateMaterialRequestSchema,
  type GenerateMaterialResponse,
  type MaterialSummary,
  type ObjectiveProgressOverview,
  type Role,
  type StudentMaterialView,
  type TeacherMaterial,
  type updateMaterialRequestSchema,
} from "@app/shared";
import type { z } from "zod";
import { request } from "./client";

// The materials API uses camelCase throughout (the auth/classes endpoints use snake_case).

export type CreateMaterialInput = z.input<typeof createMaterialRequestSchema>;
export type UpdateMaterialInput = z.input<typeof updateMaterialRequestSchema>;
export type GenerateMaterialInput = z.input<typeof generateMaterialRequestSchema>;
export type MaterialStatus = "draft" | "published" | "archived";
export type Subject = z.infer<typeof subjectsResponseSchema>["subjects"][number];

const materialPath = (id: string) => `/materials/${encodeURIComponent(id)}`;

/** GET /api/subjects */
export async function listSubjects(): Promise<Subject[]> {
  const { subjects } = await request("GET", "/subjects", { schema: subjectsResponseSchema });
  return subjects;
}

/** GET /api/materials (teacher: own materials, optional status filter) */
export async function listMaterials(status?: MaterialStatus): Promise<MaterialSummary[]> {
  const { materials } = await request("GET", `/materials${status ? `?status=${status}` : ""}`, {
    schema: materialListResponseSchema,
  });
  return materials;
}

/** POST /api/materials (teacher): a manual draft */
export async function createMaterial(body: CreateMaterialInput): Promise<TeacherMaterial> {
  const { material } = await request("POST", "/materials", {
    body,
    schema: teacherMaterialResponseSchema,
  });
  return material;
}

/** POST /api/materials/generate (teacher): an AI-generated draft */
export function generateMaterial(body: GenerateMaterialInput): Promise<GenerateMaterialResponse> {
  return request("POST", "/materials/generate", { body, schema: generateMaterialResponseSchema });
}

/** GET /api/materials/:id: the owning teacher's full material, with the answer key. */
export async function getMaterial(role: "teacher", id: string): Promise<TeacherMaterial>;
/** GET /api/materials/:id: what an enrolled student may see (no answer key). */
export async function getMaterial(role: "student", id: string): Promise<StudentMaterialView>;
export async function getMaterial(
  role: Role,
  id: string,
): Promise<TeacherMaterial | StudentMaterialView> {
  if (role === "teacher") {
    const { material } = await request("GET", materialPath(id), {
      schema: teacherMaterialResponseSchema,
    });
    return material;
  }
  const { material } = await request("GET", materialPath(id), {
    schema: studentMaterialResponseSchema,
  });
  return material;
}

/** PATCH /api/materials/:id (owner, drafts only) */
export async function updateMaterial(
  id: string,
  body: UpdateMaterialInput,
): Promise<TeacherMaterial> {
  const { material } = await request("PATCH", materialPath(id), {
    body,
    schema: teacherMaterialResponseSchema,
  });
  return material;
}

/** POST /api/materials/:id/confirm (owner): marks answer keys as teacher-confirmed */
export async function confirmQuestions(
  id: string,
  questionIds: string[],
): Promise<TeacherMaterial> {
  const { material } = await request("POST", `${materialPath(id)}/confirm`, {
    body: { questionIds },
    schema: teacherMaterialResponseSchema,
  });
  return material;
}

/** POST /api/materials/:id/publish (owner). Blocked until every question is confirmed. */
export async function publishMaterial(id: string): Promise<TeacherMaterial> {
  const { material } = await request("POST", `${materialPath(id)}/publish`, {
    schema: teacherMaterialResponseSchema,
  });
  return material;
}

/** POST /api/materials/:id/new-version (owner, published source) */
export async function createNewVersion(id: string): Promise<TeacherMaterial> {
  const { material } = await request("POST", `${materialPath(id)}/new-version`, {
    schema: teacherMaterialResponseSchema,
  });
  return material;
}

/** POST /api/materials/:id/assign (owner): all-or-nothing, only to the teacher's own classes */
export function assignMaterial(id: string, classIds: string[]) {
  return request("POST", `${materialPath(id)}/assign`, {
    body: { classIds },
    schema: assignMaterialResponseSchema,
  });
}

/** GET /api/materials/:id/objective-progress (teacher): each enrolled student's own practice progress. */
export function getObjectiveProgress(id: string): Promise<ObjectiveProgressOverview> {
  return request("GET", `${materialPath(id)}/objective-progress`, {
    schema: objectiveProgressOverviewResponseSchema,
  });
}
