import {
  DEFAULT_POLICY,
  materialDefinitionSchema,
  type GenerateMaterialRequest,
  type GenerateMaterialResponse,
} from "@app/shared";
import { AiUnavailableError, getAiEngine, type Objective } from "../ai";
import { env } from "../config/env";
import { HttpError } from "../middleware/error-handler";
import { tryConsumeAiQuota } from "../repositories/ai-usage-repository";
import { findClassById, type ClassRecord } from "../repositories/class-repository";
import { findDocumentIdsInClass, listChunksForClass } from "../repositories/document-repository";
import { createMaterial } from "../repositories/material-repository";
import { findChapterWithObjectives, findSubjectById } from "../repositories/subject-repository";
import { contentOf, reconcileVerification } from "./material-content";
import { toTeacherMaterial } from "./material-service";
import { retrieveChunks } from "./retrieval";
import type { AuthContext } from "./token-service";

const SOURCE_CHUNK_LIMIT = 6;
const DEFAULT_QUESTION_COUNT = 6;
const STYLE_SAMPLE_CHUNKS = 10;
const STYLE_SAMPLE_MAX_CHARS = 8000;
const MAX_OBJECTIVE_CHARS = 500;

const KIND_LABEL = {
  lesson: "Lecție",
  test: "Test",
  problem: "Probleme",
  exercise: "Exerciții",
} as const;

// Same policy as classes, materials and documents: a resource you may not access is
// indistinguishable from one that does not exist.
const classNotFound = () => new HttpError(404, "CLASS_NOT_FOUND", "Clasa nu a fost găsită.");
const documentNotFound = () =>
  new HttpError(404, "DOCUMENT_NOT_FOUND", "Documentul nu a fost găsit.");
const invalidSubject = (message: string) => new HttpError(400, "INVALID_SUBJECT", message);

function assertTeacher(auth: AuthContext): void {
  if (auth.role !== "teacher") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

/** The class, only if it belongs to this teacher (otherwise 404). */
async function loadOwnedClass(auth: AuthContext, classId: string): Promise<ClassRecord> {
  assertTeacher(auth);
  const found = await findClassById(classId);
  if (!found || found.teacherId !== auth.userId) throw classNotFound();
  return found;
}

/** The current UTC day as YYYY-MM-DD: the key of the daily quota. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Consumes one unit of the teacher's daily AI quota, atomically (see tryConsumeAiQuota).
 * Lesson/quiz generation and style-notes suggestions share ONE counter: the quota exists to bound
 * AI cost per teacher, and every AI call costs about the same, so a single budget is simpler for
 * teachers to understand. A call that fails after this point (e.g. AI unavailable) still counts:
 * the budget caps attempts, not successes.
 */
async function consumeQuota(auth: AuthContext): Promise<{ used: number; limit: number }> {
  const limit = env.AI_DAILY_LIMIT_PER_TEACHER;
  const used = await tryConsumeAiQuota(auth.userId, utcDay(), limit);
  if (used === null) {
    throw new HttpError(
      429,
      "QUOTA_EXCEEDED",
      "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine.",
      { limit },
    );
  }
  return { used, limit };
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Cuts at a character limit without leaving half of a surrogate pair at the end. */
function cutSafely(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

export async function generateMaterial(
  auth: AuthContext,
  input: GenerateMaterialRequest,
): Promise<GenerateMaterialResponse> {
  // 1. Ownership and validation. None of this consumes quota.
  const cls = await loadOwnedClass(auth, input.classId);

  const subject = await findSubjectById(input.subjectId);
  if (!subject) throw invalidSubject("Subiectul nu există.");
  if (subject.grade !== null && subject.grade !== cls.grade) {
    throw invalidSubject("Subiectul nu corespunde clasei.");
  }
  const chapter = await findChapterWithObjectives(input.chapterId);
  if (!chapter || chapter.subjectId !== subject.id) {
    throw invalidSubject("Capitolul nu aparține subiectului.");
  }

  const requested = new Set(input.objectiveIds);
  const objectives: Objective[] = chapter.objectives
    .filter((objective) => requested.has(objective.id))
    .map((objective) => ({ id: objective.id, text: clip(objective.text, MAX_OBJECTIVE_CHARS) }));
  if (objectives.length !== requested.size) {
    throw new HttpError(400, "INVALID_OBJECTIVES", "Unele obiective nu aparțin capitolului ales.");
  }

  // Documents may only come from this teacher's class; otherwise the whole request is a 404.
  const documentIds = input.documentIds ? [...new Set(input.documentIds)] : undefined;
  if (documentIds) {
    const inClass = new Set(await findDocumentIdsInClass(cls.id, documentIds));
    if (documentIds.some((id) => !inClass.has(id))) throw documentNotFound();
  }

  // 2. Source material from this class's documents only.
  const query = objectives.map((objective) => objective.text).join(" ");
  let chunks = await retrieveChunks(cls.id, query, SOURCE_CHUNK_LIMIT, documentIds);
  if (chunks.length === 0 && documentIds) {
    // The teacher picked these documents explicitly: use their opening chunks even when no
    // word of the objectives matches, instead of silently generating without a source.
    const leading = await listChunksForClass(cls.id);
    chunks = leading
      .filter((chunk) => documentIds.includes(chunk.documentId))
      .slice(0, SOURCE_CHUNK_LIMIT)
      .map((chunk) => ({ ...chunk, score: 0 }));
  }
  const usedTeacherSource = chunks.length > 0;
  const basedOnDocumentIds = [...new Set(chunks.map((chunk) => chunk.documentId))];

  // 3. The engine first (a provider that cannot even start must not cost a unit of quota), then
  // the quota, then the AI call. Class-level content uses the neutral policy: no single student
  // is in view here, and no student data is read or sent.
  const engine = await getAiEngine();
  const quota = await consumeQuota(auth);
  const context = {
    subjectTitle: subject.title,
    chapterTitle: chapter.title,
    objectives,
    sourceChunks: chunks.map((chunk) => chunk.text),
    styleNotes: cls.styleNotes,
    policy: DEFAULT_POLICY,
    language: subject.language,
  };

  const generated =
    input.kind === "lesson"
      ? { lesson: (await engine.generateLesson(context)).lesson }
      : {
          questions: (
            await engine.generateQuiz({
              ...context,
              count: input.count ?? DEFAULT_QUESTION_COUNT,
              kind: input.kind,
            })
          ).questions,
        };

  // 4. Assemble and validate the whole material; nothing is saved unless it is fully valid.
  const parsed = materialDefinitionSchema.safeParse({
    title: clip(`${KIND_LABEL[input.kind]}: ${chapter.title}`, 200),
    kind: input.kind,
    section: subject.section,
    language: subject.language,
    grade: subject.grade ?? cls.grade,
    objectives,
    ...generated,
    generation: { provider: engine.provider, teacherSource: usedTeacherSource },
  });
  if (!parsed.success) throw new AiUnavailableError();
  const definition = reconcileVerification(null, parsed.data);

  const record = await createMaterial({
    ownerId: auth.userId,
    kind: definition.kind,
    title: definition.title,
    subjectId: subject.id,
    chapterId: chapter.id,
    content: contentOf(definition),
    source: usedTeacherSource ? "document_based" : "ai",
    basedOnDocumentIds,
  });

  return { material: toTeacherMaterial(record), usedTeacherSource, quota };
}

/**
 * Suggests style notes from the class's own documents (a capped sample). The suggestion is only
 * returned: the teacher saves it, if they accept it, through PATCH style-notes.
 */
export async function suggestStyleNotes(
  auth: AuthContext,
  classId: string,
): Promise<{ suggestion: string; basedOnChunks: number; quota: { used: number; limit: number } }> {
  const cls = await loadOwnedClass(auth, classId);

  const chunks = await listChunksForClass(cls.id, { take: STYLE_SAMPLE_CHUNKS });
  if (chunks.length === 0) {
    throw new HttpError(
      400,
      "NO_DOCUMENTS",
      "Adaugă cel puțin un document înainte de a cere o sugestie de stil.",
    );
  }
  const sampleText = cutSafely(
    chunks.map((chunk) => chunk.text).join("\n\n"),
    STYLE_SAMPLE_MAX_CHARS,
  );

  const engine = await getAiEngine();
  const quota = await consumeQuota(auth);
  const result = await engine.extractStyleNotes({ sampleText });
  return { suggestion: result.styleNotes, basedOnChunks: chunks.length, quota };
}
