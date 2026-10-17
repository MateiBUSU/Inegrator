import {
  documentListResponseSchema,
  documentResponseSchema,
  styleNotesResponseSchema,
  styleNotesSuggestionResponseSchema,
  type CreateDocumentRequest,
  type DocumentSummary,
} from "@app/shared";
import { z } from "zod";
import { request } from "./client";

// Document endpoints: request bodies are `title`/`text`/`styleNotes` as the API defines them;
// responses are snake_case (created_at, chunk_count, style_notes).

const classPath = (classId: string) => `/classes/${encodeURIComponent(classId)}`;

/** POST /api/classes/:id/documents (owning teacher) */
export async function createDocument(
  classId: string,
  body: CreateDocumentRequest,
): Promise<DocumentSummary> {
  const { document } = await request("POST", `${classPath(classId)}/documents`, {
    body,
    schema: documentResponseSchema,
  });
  return document;
}

/** GET /api/classes/:id/documents (owning teacher) */
export async function listDocuments(classId: string): Promise<DocumentSummary[]> {
  const { documents } = await request("GET", `${classPath(classId)}/documents`, {
    schema: documentListResponseSchema,
  });
  return documents;
}

/** DELETE /api/documents/:id (owning teacher, 204) */
export function deleteDocument(documentId: string): Promise<void> {
  return request("DELETE", `/documents/${encodeURIComponent(documentId)}`);
}

/** PATCH /api/classes/:id/style-notes (owning teacher). An empty string clears the notes. */
export function updateStyleNotes(
  classId: string,
  styleNotes: string,
): Promise<z.infer<typeof styleNotesResponseSchema>> {
  return request("PATCH", `${classPath(classId)}/style-notes`, {
    body: { styleNotes },
    schema: styleNotesResponseSchema,
  });
}

/** POST /api/classes/:id/style-notes/extract (owning teacher). A suggestion only; not saved. */
export function extractStyleNotes(
  classId: string,
): Promise<z.infer<typeof styleNotesSuggestionResponseSchema>> {
  return request("POST", `${classPath(classId)}/style-notes/extract`, {
    schema: styleNotesSuggestionResponseSchema,
  });
}
