import express, { Router } from "express";
import {
  classIdParamsSchema,
  createDocumentRequestSchema,
  documentIdParamsSchema,
  documentListResponseSchema,
  documentResponseSchema,
  styleNotesResponseSchema,
  styleNotesSuggestionResponseSchema,
  updateStyleNotesRequestSchema,
  type CreateDocumentRequest,
  type UpdateStyleNotesRequest,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { createGenerationRateLimiter } from "../middleware/rate-limit";
import { validateBody, validateParams } from "../middleware/validate";
import * as documentService from "../services/document-service";
import * as generationService from "../services/generation-service";

const DOCUMENT_BODY_LIMIT = "1mb";

// Teachers only, and only for their own classes (checked in the service). Students get 403 from
// requireRole before anything else runs. Identity comes from the session only.

/** Mounted at /api/classes: documents and style notes of a class. */
export function createClassDocumentsRouter(): Router {
  const router = Router();

  router.post(
    "/:id/documents",
    requireAuth,
    requireRole("teacher"),
    // Larger than the 200 KB text limit: JSON escaping can inflate text (up to 6x for control
    // characters), and a body between 200 KB and this limit gets the clean 400 from validation.
    // Runs only after authentication and the teacher check.
    express.json({ limit: DOCUMENT_BODY_LIMIT }),
    validateParams(classIdParamsSchema),
    validateBody(createDocumentRequestSchema, { includeIssues: true }),
    async (req, res) => {
      const document = await documentService.createDocument(
        getAuth(req),
        String(req.params.id),
        req.body as CreateDocumentRequest,
      );
      res.status(201).json(documentResponseSchema.parse({ document }));
    },
  );

  router.get(
    "/:id/documents",
    requireAuth,
    requireRole("teacher"),
    validateParams(classIdParamsSchema),
    async (req, res) => {
      const documents = await documentService.listDocuments(getAuth(req), String(req.params.id));
      res.json(documentListResponseSchema.parse({ documents }));
    },
  );

  router.patch(
    "/:id/style-notes",
    requireAuth,
    requireRole("teacher"),
    express.json(), // default 100 KB limit; style notes are at most 2000 characters
    validateParams(classIdParamsSchema),
    validateBody(updateStyleNotesRequestSchema),
    async (req, res) => {
      const saved = await documentService.updateStyleNotes(
        getAuth(req),
        String(req.params.id),
        (req.body as UpdateStyleNotesRequest).styleNotes,
      );
      res.json(
        styleNotesResponseSchema.parse({ class_id: saved.classId, style_notes: saved.styleNotes }),
      );
    },
  );

  // Suggests style notes from the class's documents. Returns the suggestion only; it is NOT
  // saved. The teacher saves it, if they accept it, with PATCH /:id/style-notes. No body needed.
  const generationLimiter = createGenerationRateLimiter();
  router.post(
    "/:id/style-notes/extract",
    requireAuth,
    requireRole("teacher"),
    generationLimiter,
    validateParams(classIdParamsSchema),
    async (req, res) => {
      const result = await generationService.suggestStyleNotes(getAuth(req), String(req.params.id));
      res.json(styleNotesSuggestionResponseSchema.parse(result));
    },
  );

  return router;
}

/** Mounted at /api/documents. */
export function createDocumentsRouter(): Router {
  const router = Router();

  router.delete(
    "/:id",
    requireAuth,
    requireRole("teacher"),
    validateParams(documentIdParamsSchema),
    async (req, res) => {
      await documentService.removeDocument(getAuth(req), String(req.params.id));
      res.status(204).end();
    },
  );

  return router;
}
