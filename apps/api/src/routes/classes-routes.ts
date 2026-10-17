import { Router } from "express";
import {
  classIdParamsSchema,
  createClassRequestSchema,
  joinClassRequestSchema,
  studentClassListResponseSchema,
  studentClassResponseSchema,
  studentProgressParamsSchema,
  studentProgressResponseSchema,
  teacherClassDetailResponseSchema,
  teacherClassListResponseSchema,
  teacherClassResponseSchema,
  type CreateClassRequest,
  type JoinClassRequest,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { createJoinRateLimiter } from "../middleware/rate-limit";
import { validateBody, validateParams } from "../middleware/validate";
import * as classService from "../services/class-service";

// Identity always comes from the verified session (req.auth), never from body or params.
// Responses are parsed through role-specific schemas, which strip any field not listed.
export function createClassesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/",
    requireRole("teacher"),
    validateBody(createClassRequestSchema),
    async (req, res) => {
      const created = await classService.createTeacherClass(
        getAuth(req),
        req.body as CreateClassRequest,
      );
      res.status(201).json(teacherClassResponseSchema.parse({ class: created }));
    },
  );

  router.get("/", async (req, res) => {
    const result = await classService.listClasses(getAuth(req));
    res.json(
      result.role === "teacher"
        ? teacherClassListResponseSchema.parse({ classes: result.classes })
        : studentClassListResponseSchema.parse({ classes: result.classes }),
    );
  });

  router.post(
    "/join",
    requireRole("student"),
    createJoinRateLimiter(),
    validateBody(joinClassRequestSchema),
    async (req, res) => {
      const joined = await classService.joinClass(
        getAuth(req),
        (req.body as JoinClassRequest).code,
      );
      res.json(studentClassResponseSchema.parse({ class: joined }));
    },
  );

  router.get("/:id", validateParams(classIdParamsSchema), async (req, res) => {
    const result = await classService.getClass(getAuth(req), String(req.params.id));
    res.json(
      result.role === "teacher"
        ? teacherClassDetailResponseSchema.parse({ class: result.class })
        : studentClassResponseSchema.parse({ class: result.class }),
    );
  });

  router.get(
    "/:id/students/:studentId/progress",
    requireRole("teacher"),
    validateParams(studentProgressParamsSchema),
    async (req, res) => {
      const progress = await classService.getStudentProgress(
        getAuth(req),
        String(req.params.id),
        String(req.params.studentId),
      );
      res.json(studentProgressResponseSchema.parse(progress));
    },
  );

  return router;
}
