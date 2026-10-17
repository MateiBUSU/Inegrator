import { z } from "zod";
import { isWellFormed, safeText, utf8ByteLength } from "./safe-text";

export const MAX_DOCUMENT_BYTES = 200 * 1024;
export const MAX_STYLE_NOTES_CHARS = 2000;
// Bounds storage and the per-query retrieval cost for one class (about 4 MB of text at most).
export const MAX_DOCUMENTS_PER_CLASS = 20;

export const createDocumentRequestSchema = z.object({
  title: safeText(200).trim().min(1),
  // Plain text or markdown. The limit is in UTF-8 bytes (Romanian diacritics take 2 each).
  text: z
    .string()
    .refine((value) => value.trim().length > 0, "text must not be empty")
    .refine((value) => utf8ByteLength(value) <= MAX_DOCUMENT_BYTES, "text exceeds 200 KB")
    .refine((value) => !value.includes("\u0000"), "NUL character not allowed")
    .refine(isWellFormed, "invalid unicode (lone surrogate)"),
});
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const documentIdParamsSchema = z.object({ id: z.uuid() });

export const updateStyleNotesRequestSchema = z.object({
  styleNotes: safeText(MAX_STYLE_NOTES_CHARS),
});
export type UpdateStyleNotesRequest = z.infer<typeof updateStyleNotesRequestSchema>;

// Responses follow the classes endpoints (snake_case).
export const documentSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  created_at: z.string(),
  chunk_count: z.number().int(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentResponseSchema = z.object({ document: documentSummarySchema });
export const documentListResponseSchema = z.object({ documents: z.array(documentSummarySchema) });
export const styleNotesResponseSchema = z.object({
  class_id: z.uuid(),
  style_notes: z.string().nullable(),
});
