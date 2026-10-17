import {
  MAX_DOCUMENTS_PER_CLASS,
  type CreateDocumentRequest,
  type DocumentSummary,
} from "@app/shared";
import { HttpError } from "../middleware/error-handler";
import { findClassById, setStyleNotes } from "../repositories/class-repository";
import {
  ClassGoneError,
  countDocumentsByClass,
  createDocumentWithChunks,
  deleteDocument,
  findDocumentOwner,
  listDocumentsByClass,
  type DocumentSummaryRecord,
} from "../repositories/document-repository";
import { chunkText } from "./chunking";
import type { AuthContext } from "./token-service";

// Same policy as classes and materials: a resource you may not access is indistinguishable from
// one that does not exist (404, identical body).
function classNotFound(): HttpError {
  return new HttpError(404, "CLASS_NOT_FOUND", "Clasa nu a fost găsită.");
}
function documentNotFound(): HttpError {
  return new HttpError(404, "DOCUMENT_NOT_FOUND", "Documentul nu a fost găsit.");
}

function assertTeacher(auth: AuthContext): void {
  if (auth.role !== "teacher") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

function toSummary(record: DocumentSummaryRecord): DocumentSummary {
  return {
    id: record.id,
    title: record.title,
    created_at: record.createdAt.toISOString(),
    chunk_count: record.chunkCount,
  };
}

/** Resolves the class only if it belongs to this teacher; otherwise 404. */
async function assertOwnsClass(auth: AuthContext, classId: string): Promise<void> {
  assertTeacher(auth);
  const found = await findClassById(classId);
  if (!found || found.teacherId !== auth.userId) throw classNotFound();
}

export async function createDocument(
  auth: AuthContext,
  classId: string,
  input: CreateDocumentRequest,
): Promise<DocumentSummary> {
  await assertOwnsClass(auth, classId);

  // Bounds storage and retrieval cost per class. Check-then-insert is not atomic, so a burst of
  // parallel uploads could overshoot slightly; the cap is a guard rail, not an exact quota.
  if ((await countDocumentsByClass(classId)) >= MAX_DOCUMENTS_PER_CLASS) {
    throw new HttpError(
      409,
      "DOCUMENT_LIMIT_REACHED",
      `O clasă poate avea cel mult ${MAX_DOCUMENTS_PER_CLASS} documente. Șterge unul pentru a adăuga altul.`,
    );
  }

  const chunks = chunkText(input.text);
  if (chunks.length === 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Textul documentului nu poate fi gol.");
  }
  try {
    const created = await createDocumentWithChunks({
      classId,
      teacherId: auth.userId,
      title: input.title,
      chunks,
    });
    return toSummary(created);
  } catch (err) {
    // The class was deleted after the ownership check.
    if (err instanceof ClassGoneError) throw classNotFound();
    throw err;
  }
}

export async function listDocuments(
  auth: AuthContext,
  classId: string,
): Promise<DocumentSummary[]> {
  await assertOwnsClass(auth, classId);
  const documents = await listDocumentsByClass(classId);
  return documents.map(toSummary);
}

export async function removeDocument(auth: AuthContext, documentId: string): Promise<void> {
  assertTeacher(auth);
  const found = await findDocumentOwner(documentId);
  // Ownership is the owner of the document's class, never anything the client sends.
  if (!found || found.classTeacherId !== auth.userId) throw documentNotFound();
  if (!(await deleteDocument(found.id))) throw documentNotFound();
}

export async function updateStyleNotes(
  auth: AuthContext,
  classId: string,
  styleNotes: string,
): Promise<{ classId: string; styleNotes: string | null }> {
  await assertOwnsClass(auth, classId);
  // An empty value clears the notes.
  const value = styleNotes.trim() === "" ? null : styleNotes.trim();
  if (!(await setStyleNotes(classId, auth.userId, value))) throw classNotFound();
  return { classId, styleNotes: value };
}
