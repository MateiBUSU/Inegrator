import {
  allQuestions,
  materialDefinitionSchema,
  objectiveProgressOverviewResponseSchema,
  toStudentMaterialView,
  type CreateMaterialRequest,
  type MaterialDefinition,
  type MaterialSummary,
  type ObjectiveProgressOverview,
  type StudentMaterialView,
  type TeacherMaterial,
  type UpdateMaterialRequest,
} from "@app/shared";
import { HttpError } from "../middleware/error-handler";
import { validationError } from "../middleware/validate";
import {
  DuplicateVersionError,
  UnknownClassError,
  assignToClasses,
  createMaterial,
  findClassIdsOwnedBy,
  findMaterialById,
  isAssignedToStudent,
  listMaterialsByOwner,
  publishIf,
  updateDraftIf,
  type MaterialRecord,
  type MaterialStatusValue,
} from "../repositories/material-repository";
import {
  listProgressForStudents,
  listStudentsOfMaterial,
} from "../repositories/practice-repository";
import { findChapterById, findSubjectById, listSubjects } from "../repositories/subject-repository";
import {
  contentOf,
  definitionOf,
  reconcileVerification,
  resetVerification,
  setVerification,
} from "./material-content";
import type { AuthContext } from "./token-service";

// Same policy as classes: a material you may not access is indistinguishable from one that does
// not exist (404, identical body).
function materialNotFound(): HttpError {
  return new HttpError(404, "MATERIAL_NOT_FOUND", "Materialul nu a fost găsit.");
}

function assertTeacher(auth: AuthContext): void {
  if (auth.role !== "teacher") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

function conflict(code: string, message: string, details?: Record<string, unknown>): HttpError {
  return new HttpError(409, code, message, details);
}

export function toTeacherMaterial(record: MaterialRecord): TeacherMaterial {
  return {
    ...definitionOf(record),
    id: record.id,
    status: record.status,
    source: record.source,
    version: record.version,
    parentId: record.parentId,
    subjectId: record.subjectId,
    chapterId: record.chapterId,
    createdAt: record.createdAt.toISOString(),
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
  };
}

function toSummary(record: MaterialRecord): MaterialSummary {
  const def = definitionOf(record);
  return {
    id: record.id,
    title: def.title,
    kind: def.kind,
    status: record.status,
    version: record.version,
    section: def.section,
    language: def.language,
    grade: def.grade,
    subjectId: record.subjectId,
    chapterId: record.chapterId,
    createdAt: record.createdAt.toISOString(),
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
  };
}

/** The material, only if it is owned by this teacher (otherwise 404). */
async function loadOwned(auth: AuthContext, id: string): Promise<MaterialRecord> {
  assertTeacher(auth);
  const record = await findMaterialById(id);
  if (!record || record.ownerId !== auth.userId || record.scope !== "class") {
    throw materialNotFound();
  }
  return record;
}

function requireDraft(record: MaterialRecord): void {
  if (record.status !== "draft") {
    throw conflict(
      "MATERIAL_NOT_DRAFT",
      "Materialul publicat nu poate fi modificat. Creează o versiune nouă.",
    );
  }
}

/** If a subject/chapter is linked, it must exist and match the material. */
async function assertSubjectLink(
  def: MaterialDefinition,
  subjectId: string | null,
  chapterId: string | null,
): Promise<void> {
  const invalid = (message: string) => new HttpError(400, "INVALID_SUBJECT", message);
  if (chapterId && !subjectId) throw invalid("chapterId necesită subjectId.");
  if (!subjectId) return;

  const subject = await findSubjectById(subjectId);
  if (!subject) throw invalid("Subiectul nu există.");
  if (subject.section !== def.section || subject.language !== def.language) {
    throw invalid("Subiectul nu corespunde secțiunii sau limbajului materialului.");
  }
  if (subject.section === "programa" && subject.grade !== def.grade) {
    throw invalid("Subiectul nu corespunde clasei materialului.");
  }
  if (chapterId) {
    const chapter = await findChapterById(chapterId);
    if (!chapter || chapter.subjectId !== subjectId) {
      throw invalid("Capitolul nu aparține subiectului.");
    }
  }
}

export async function listSubjectCatalog() {
  return listSubjects();
}

export async function createManualMaterial(
  auth: AuthContext,
  input: CreateMaterialRequest,
): Promise<TeacherMaterial> {
  assertTeacher(auth);
  const { subjectId, chapterId, ...rest } = input;
  const def = reconcileVerification(null, materialDefinitionSchema.parse(rest));
  await assertSubjectLink(def, subjectId ?? null, chapterId ?? null);

  const record = await createMaterial({
    ownerId: auth.userId,
    kind: def.kind,
    title: def.title,
    subjectId: subjectId ?? null,
    chapterId: chapterId ?? null,
    content: contentOf(def),
  });
  return toTeacherMaterial(record);
}

export async function listOwnMaterials(
  auth: AuthContext,
  status?: MaterialStatusValue,
): Promise<MaterialSummary[]> {
  assertTeacher(auth);
  const records = await listMaterialsByOwner(auth.userId, status);
  return records.map(toSummary);
}

export async function getMaterial(
  auth: AuthContext,
  id: string,
): Promise<
  | { role: "teacher"; material: TeacherMaterial }
  | { role: "student"; material: StudentMaterialView }
> {
  const record = await findMaterialById(id);
  if (!record || record.scope !== "class") throw materialNotFound();

  if (auth.role === "teacher") {
    if (record.ownerId !== auth.userId) throw materialNotFound();
    return { role: "teacher", material: toTeacherMaterial(record) };
  }

  // Students: only published materials assigned to a class they are enrolled in.
  if (record.status !== "published") throw materialNotFound();
  if (!(await isAssignedToStudent(record.id, auth.userId))) throw materialNotFound();
  return {
    role: "student",
    material: toStudentMaterialView({
      ...definitionOf(record),
      id: record.id,
      version: record.version,
    }),
  };
}

export async function updateDraft(
  auth: AuthContext,
  id: string,
  patch: UpdateMaterialRequest,
): Promise<TeacherMaterial> {
  const record = await loadOwned(auth, id);
  requireDraft(record);

  const current = definitionOf(record);
  const { subjectId: patchSubject, chapterId: patchChapter, ...fields } = patch;
  const defined = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  const merged = materialDefinitionSchema.safeParse({ ...current, ...defined });
  if (!merged.success) throw validationError(merged.error, true);

  const next = reconcileVerification(current, merged.data);
  const subjectId = patchSubject === undefined ? record.subjectId : patchSubject;
  const chapterId = patchChapter === undefined ? record.chapterId : patchChapter;
  await assertSubjectLink(next, subjectId, chapterId);

  const saved = await updateDraftIf(record.id, auth.userId, record.content, {
    title: next.title,
    subjectId,
    chapterId,
    content: contentOf(next),
  });
  if (!saved) throw modifiedConcurrently();
  return toTeacherMaterial(await reload(record.id));
}

function modifiedConcurrently(): HttpError {
  return conflict("MATERIAL_CHANGED", "Materialul a fost modificat între timp. Reîncearcă.");
}

async function reload(id: string): Promise<MaterialRecord> {
  const record = await findMaterialById(id);
  if (!record) throw materialNotFound();
  return record;
}

export async function confirmQuestions(
  auth: AuthContext,
  id: string,
  questionIds: string[],
): Promise<TeacherMaterial> {
  const record = await loadOwned(auth, id);
  requireDraft(record);

  const def = definitionOf(record);
  const known = new Set(allQuestions(def).map((q) => q.id));
  const unknown = [...new Set(questionIds)].filter((qid) => !known.has(qid));
  if (unknown.length > 0) {
    throw new HttpError(400, "UNKNOWN_QUESTIONS", "Unele întrebări nu există în material.", {
      questionIds: unknown,
    });
  }

  const next = setVerification(def, new Set(questionIds), "teacher_confirmed");
  const saved = await updateDraftIf(record.id, auth.userId, record.content, {
    title: next.title,
    subjectId: record.subjectId,
    chapterId: record.chapterId,
    content: contentOf(next),
  });
  if (!saved) throw modifiedConcurrently();
  return toTeacherMaterial(await reload(record.id));
}

export async function publish(auth: AuthContext, id: string): Promise<TeacherMaterial> {
  const record = await loadOwned(auth, id);
  requireDraft(record);

  const unconfirmed = allQuestions(definitionOf(record))
    .filter((q) => q.verification !== "teacher_confirmed")
    .map((q) => q.id);
  if (unconfirmed.length > 0) {
    throw conflict(
      "UNCONFIRMED_QUESTIONS",
      "Toate răspunsurile corecte trebuie confirmate înainte de publicare.",
      { questionIds: unconfirmed },
    );
  }

  // Guarded on the content that was just checked: an edit that slipped in meanwhile fails this.
  const published = await publishIf(record.id, auth.userId, record.content, new Date());
  if (!published) throw modifiedConcurrently();
  return toTeacherMaterial(await reload(record.id));
}

export async function createNewVersion(auth: AuthContext, id: string): Promise<TeacherMaterial> {
  const record = await loadOwned(auth, id);
  if (record.status !== "published") {
    throw conflict("MATERIAL_NOT_PUBLISHED", "Doar un material publicat poate avea versiune nouă.");
  }

  const def = resetVerification(definitionOf(record));
  try {
    const created = await createMaterial({
      ownerId: auth.userId,
      kind: def.kind,
      title: def.title,
      subjectId: record.subjectId,
      chapterId: record.chapterId,
      content: contentOf(def),
      version: record.version + 1,
      parentId: record.id,
    });
    return toTeacherMaterial(created);
  } catch (err) {
    if (err instanceof DuplicateVersionError) {
      throw conflict("VERSION_EXISTS", "Există deja o versiune nouă a acestui material.");
    }
    throw err;
  }
}

export async function assign(
  auth: AuthContext,
  id: string,
  classIds: string[],
): Promise<{ materialId: string; classIds: string[] }> {
  const record = await loadOwned(auth, id);

  // Every class must belong to this teacher. All-or-nothing: if even one does not, nothing is
  // assigned. Progress is later matched by "material assigned to this class", so a foreign
  // assignment would expose a material (and its students' results) across teachers.
  const requested = [...new Set(classIds)];
  const owned = new Set(await findClassIdsOwnedBy(auth.userId, requested));
  if (requested.some((classId) => !owned.has(classId))) {
    throw new HttpError(404, "CLASS_NOT_FOUND", "Clasa nu a fost găsită.");
  }

  if (record.status !== "published") {
    throw conflict(
      "MATERIAL_NOT_PUBLISHED",
      "Doar un material publicat poate fi atribuit unei clase.",
    );
  }

  try {
    await assignToClasses(record.id, requested);
  } catch (err) {
    // A class was deleted after the ownership check: nothing was written (single statement).
    if (err instanceof UnknownClassError) {
      throw new HttpError(404, "CLASS_NOT_FOUND", "Clasa nu a fost găsită.");
    }
    throw err;
  }
  return { materialId: record.id, classIds: requested };
}

const OBJECTIVE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Per-student objective progress for one of the teacher's own materials: every student enrolled
 * in a class the material is assigned to, with their own row for each catalogue objective of the
 * material (not_started when they never practiced). Nothing is averaged or aggregated.
 */
export async function getObjectiveProgressOverview(
  auth: AuthContext,
  id: string,
): Promise<ObjectiveProgressOverview> {
  const record = await loadOwned(auth, id);
  // Material objective ids are local unless they are rows of the catalogue (UUIDs).
  const objectives = definitionOf(record)
    .objectives.filter((o) => OBJECTIVE_UUID.test(o.id))
    .map((o) => ({ id: o.id, text: o.text }));
  const enrolled = await listStudentsOfMaterial(record.id);

  const byStudent = new Map<string, { displayName: string; classNames: string[] }>();
  for (const entry of enrolled) {
    const known = byStudent.get(entry.studentId);
    if (known) known.classNames.push(entry.className);
    else
      byStudent.set(entry.studentId, {
        displayName: entry.displayName,
        classNames: [entry.className],
      });
  }
  const rows = await listProgressForStudents(
    [...byStudent.keys()],
    objectives.map((o) => o.id),
  );
  const rowOf = new Map(rows.map((row) => [`${row.studentId}|${row.objectiveId}`, row]));

  return objectiveProgressOverviewResponseSchema.parse({
    objectives,
    students: [...byStudent.entries()].map(([studentId, student]) => ({
      studentId,
      displayName: student.displayName,
      classNames: student.classNames,
      objectives: objectives.map((o) => {
        const row = rowOf.get(`${studentId}|${o.id}`);
        return {
          objectiveId: o.id,
          status: row?.status ?? "not_started",
          attemptsCount: row?.attemptsCount ?? 0,
          strategiesTried: row?.strategiesTried ?? [],
          helpRequestedAt: row?.helpRequestedAt?.toISOString() ?? null,
        };
      }),
    })),
  });
}
