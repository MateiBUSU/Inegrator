import { toStudentMaterialView, type ProgressStatus, type StudentMaterialView } from "@app/shared";
import { HttpError } from "../middleware/error-handler";
import {
  findMaterialById,
  isAssignedToStudent,
  listPublishedForStudent,
} from "../repositories/material-repository";
import {
  listProgressByStudent,
  recordProgress,
  type ProgressRecord,
} from "../repositories/progress-repository";
import { definitionOf } from "./material-content";
import type { AuthContext } from "./token-service";

function assertStudent(auth: AuthContext): void {
  if (auth.role !== "student") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

const materialNotFound = () =>
  new HttpError(404, "MATERIAL_NOT_FOUND", "Materialul nu a fost găsit.");

const toItem = (row: ProgressRecord) => ({
  materialId: row.materialId,
  status: row.status,
  updatedAt: row.updatedAt.toISOString(),
});

export async function setProgress(auth: AuthContext, materialId: string, status: ProgressStatus) {
  assertStudent(auth);
  const record = await findMaterialById(materialId);
  if (!record || record.scope !== "class" || record.status !== "published") {
    throw materialNotFound();
  }
  if (!(await isAssignedToStudent(record.id, auth.userId))) throw materialNotFound();
  return toItem(await recordProgress(auth.userId, record.id, status));
}

export async function listMyProgress(auth: AuthContext) {
  assertStudent(auth);
  return (await listProgressByStudent(auth.userId)).map(toItem);
}

/** Always through toStudentMaterialView: the only way a material is shown to a student. */
export async function listMyMaterials(
  auth: AuthContext,
  classId?: string,
): Promise<StudentMaterialView[]> {
  assertStudent(auth);
  const records = await listPublishedForStudent(auth.userId, classId);
  return records.map((record) =>
    toStudentMaterialView({ ...definitionOf(record), id: record.id, version: record.version }),
  );
}
