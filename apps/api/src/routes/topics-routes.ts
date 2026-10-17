import { Router } from "express";
import {
  createTopicRequestSchema,
  generatePersonalMaterialResponseSchema,
  generatePersonalQuizRequestSchema,
  personalMaterialListResponseSchema,
  personalMaterialResponseSchema,
  topicListResponseSchema,
  topicMaterialParamsSchema,
  topicParamsSchema,
  topicPolicyResponseSchema,
  topicResponseSchema,
  tutorRequestSchema,
  tutorResponseSchema,
  type CreateTopicRequest,
  type GeneratePersonalQuizRequest,
  type TutorRequest,
} from "@app/shared";
import { getAuth, requireAuth, requireRole } from "../middleware/auth";
import { createGenerationRateLimiter } from "../middleware/rate-limit";
import { validateBody, validateParams } from "../middleware/validate";
import * as materialService from "../services/personal-material-service";
import { getTopicPolicy } from "../services/policy-service";
import * as topicService from "../services/topic-service";
import { askTutor } from "../services/tutor-service";

// Personal learning space, mounted at /api/me/topics. Students only. The student is always the
// session's user: ownership of the topic is checked in the services, and a topic that belongs to
// someone else answers 404, exactly like one that does not exist.
export function createTopicsRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole("student"));

  // Burst limit for the AI endpoints; the daily quota is the real budget. Fresh counters per app.
  const aiLimiter = createGenerationRateLimiter();

  router.post("/", validateBody(createTopicRequestSchema), async (req, res) => {
    const topic = await topicService.createOwnTopic(getAuth(req), req.body as CreateTopicRequest);
    res.status(201).json(topicResponseSchema.parse({ topic }));
  });

  router.get("/", async (req, res) => {
    const topics = await topicService.listOwnTopics(getAuth(req));
    res.json(topicListResponseSchema.parse({ topics }));
  });

  router.delete("/:id", validateParams(topicParamsSchema), async (req, res) => {
    await topicService.deleteOwnTopic(getAuth(req), String(req.params.id));
    res.status(204).end();
  });

  router.get("/:id/policy", validateParams(topicParamsSchema), async (req, res) => {
    const auth = getAuth(req);
    const topic = await topicService.loadOwnedTopic(auth, String(req.params.id));
    res.json(topicPolicyResponseSchema.parse(await getTopicPolicy(auth.userId, topic.id)));
  });

  router.post(
    "/:id/tutor",
    aiLimiter,
    validateParams(topicParamsSchema),
    validateBody(tutorRequestSchema),
    async (req, res) => {
      const { message } = req.body as TutorRequest;
      const reply = await askTutor(getAuth(req), String(req.params.id), message);
      res.json(tutorResponseSchema.parse(reply));
    },
  );

  router.post("/:id/lesson", aiLimiter, validateParams(topicParamsSchema), async (req, res) => {
    const result = await materialService.generatePersonalLesson(
      getAuth(req),
      String(req.params.id),
    );
    res.status(201).json(generatePersonalMaterialResponseSchema.parse(result));
  });

  router.post(
    "/:id/quiz",
    aiLimiter,
    validateParams(topicParamsSchema),
    validateBody(generatePersonalQuizRequestSchema),
    async (req, res) => {
      const result = await materialService.generatePersonalQuiz(
        getAuth(req),
        String(req.params.id),
        req.body as GeneratePersonalQuizRequest,
      );
      res.status(201).json(generatePersonalMaterialResponseSchema.parse(result));
    },
  );

  router.get("/:id/materials", validateParams(topicParamsSchema), async (req, res) => {
    const materials = await materialService.listTopicMaterials(getAuth(req), String(req.params.id));
    res.json(personalMaterialListResponseSchema.parse({ materials }));
  });

  router.get(
    "/:id/materials/:materialId",
    validateParams(topicMaterialParamsSchema),
    async (req, res) => {
      const material = await materialService.getTopicMaterial(
        getAuth(req),
        String(req.params.id),
        String(req.params.materialId),
      );
      res.json(personalMaterialResponseSchema.parse({ material }));
    },
  );

  return router;
}
