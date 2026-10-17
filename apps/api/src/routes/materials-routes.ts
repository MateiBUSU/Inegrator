import { Router } from "express";
import {
  attemptResponseSchema,
  submitAttemptRequestSchema,
  type SubmitAttemptRequest,
  generateMaterialRequestSchema,
  generateMaterialResponseSchema,
  type GenerateMaterialRequest,
  assignMaterialRequestSchema,
  assignMaterialResponseSchema,
  confirmQuestionsRequestSchema,
  createMaterialRequestSchema,
  listMaterialsQuerySchema,
  materialIdParamsSchema,
  materialListResponseSchema,
  studentMaterialResponseSchema,
  subjectsResponseSchema,
  teacherMaterialResponseSchema,
  updateMaterialRequestSchema,
  type CreateMaterialRequest,
  type UpdateMaterialRequest,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { createGenerationRateLimiter } from "../middleware/rate-limit";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import * as attemptService from "../services/attempt-service";
import * as generationService from "../services/generation-service";
import * as materialService from "../services/material-service";

// Identity comes from the session only. Teacher responses are parsed through the full-content
// schema; students only ever get studentMaterialResponseSchema (no answer key fields exist in it).
export function createMaterialsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/",
    requireRole("teacher"),
    validateQuery(listMaterialsQuerySchema),
    async (req, res) => {
      const { status } = listMaterialsQuerySchema.parse(req.query);
      const materials = await materialService.listOwnMaterials(getAuth(req), status);
      res.json(materialListResponseSchema.parse({ materials }));
    },
  );

  router.post(
    "/",
    requireRole("teacher"),
    validateBody(createMaterialRequestSchema, { includeIssues: true }),
    async (req, res) => {
      const material = await materialService.createManualMaterial(
        getAuth(req),
        req.body as CreateMaterialRequest,
      );
      res.status(201).json(teacherMaterialResponseSchema.parse({ material }));
    },
  );

  // Registered before the "/:id" routes. Per-router limiter instance: fresh counters per app.
  const generationLimiter = createGenerationRateLimiter();
  router.post(
    "/generate",
    requireRole("teacher"),
    generationLimiter,
    validateBody(generateMaterialRequestSchema, { includeIssues: true }),
    async (req, res) => {
      const result = await generationService.generateMaterial(
        getAuth(req),
        req.body as GenerateMaterialRequest,
      );
      res.status(201).json(generateMaterialResponseSchema.parse(result));
    },
  );

  router.get("/:id", validateParams(materialIdParamsSchema), async (req, res) => {
    const result = await materialService.getMaterial(getAuth(req), String(req.params.id));
    res.json(
      result.role === "teacher"
        ? teacherMaterialResponseSchema.parse({ material: result.material })
        : studentMaterialResponseSchema.parse({ material: result.material }),
    );
  });

  router.post(
    "/:id/attempts",
    requireRole("student"),
    validateParams(materialIdParamsSchema),
    validateBody(submitAttemptRequestSchema),
    async (req, res) => {
      const attempt = await attemptService.submitAttempt(
        getAuth(req),
        String(req.params.id),
        req.body as SubmitAttemptRequest,
      );
      res.status(201).json(attemptResponseSchema.parse({ attempt }));
    },
  );

  router.patch(
    "/:id",
    requireRole("teacher"),
    validateParams(materialIdParamsSchema),
    validateBody(updateMaterialRequestSchema, { includeIssues: true }),
    async (req, res) => {
      const material = await materialService.updateDraft(
        getAuth(req),
        String(req.params.id),
        req.body as UpdateMaterialRequest,
      );
      res.json(teacherMaterialResponseSchema.parse({ material }));
    },
  );

  router.post(
    "/:id/confirm",
    requireRole("teacher"),
    validateParams(materialIdParamsSchema),
    validateBody(confirmQuestionsRequestSchema),
    async (req, res) => {
      const { questionIds } = req.body as { questionIds: string[] };
      const material = await materialService.confirmQuestions(
        getAuth(req),
        String(req.params.id),
        questionIds,
      );
      res.json(teacherMaterialResponseSchema.parse({ material }));
    },
  );

  router.post(
    "/:id/publish",
    requireRole("teacher"),
    validateParams(materialIdParamsSchema),
    async (req, res) => {
      const material = await materialService.publish(getAuth(req), String(req.params.id));
      res.json(teacherMaterialResponseSchema.parse({ material }));
    },
  );

  router.post(
    "/:id/new-version",
    requireRole("teacher"),
    validateParams(materialIdParamsSchema),
    async (req, res) => {
      const material = await materialService.createNewVersion(getAuth(req), String(req.params.id));
      res.status(201).json(teacherMaterialResponseSchema.parse({ material }));
    },
  );

  router.post(
    "/:id/assign",
    requireRole("teacher"),
    validateParams(materialIdParamsSchema),
    validateBody(assignMaterialRequestSchema),
    async (req, res) => {
      const { classIds } = req.body as { classIds: string[] };
      const result = await materialService.assign(getAuth(req), String(req.params.id), classIds);
      res.json(assignMaterialResponseSchema.parse(result));
    },
  );

  return router;
}

export function createSubjectsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    const subjects = await materialService.listSubjectCatalog();
    res.json(subjectsResponseSchema.parse({ subjects }));
  });

  return router;
}
