import { z } from "zod";
import {
  lessonSchema,
  materialKindSchema,
  objectiveRefSchema,
  questionSchema,
  studentQuestionSchema,
} from "./materials";
import { policySchema } from "./policy";
import { safeText } from "./safe-text";

// Personal learning space: topics a student studies on their own, outside any class.
// camelCase like the other /api/me endpoints.

export const MAX_TOPIC_TITLE_CHARS = 100;
export const MAX_TOPIC_GOAL_CHARS = 300;
export const MAX_TUTOR_MESSAGE_CHARS = 1000;
export const MAX_TUTOR_REPLY_CHARS = 4000;

export const createTopicRequestSchema = z.object({
  title: safeText(MAX_TOPIC_TITLE_CHARS).trim().min(1),
  goal: safeText(MAX_TOPIC_GOAL_CHARS).trim().min(1),
});
export type CreateTopicRequest = z.infer<typeof createTopicRequestSchema>;

export const topicParamsSchema = z.object({ id: z.uuid() });
export const topicMaterialParamsSchema = z.object({ id: z.uuid(), materialId: z.uuid() });

export const topicSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  goal: z.string(),
  createdAt: z.string(),
});
export type Topic = z.infer<typeof topicSchema>;
export const topicResponseSchema = z.object({ topic: topicSchema });
export const topicListResponseSchema = z.object({ topics: z.array(topicSchema) });

// --- tutor -------------------------------------------------------------------------------------

export const tutorRequestSchema = z.object({
  message: safeText(MAX_TUTOR_MESSAGE_CHARS).trim().min(1),
});
export type TutorRequest = z.infer<typeof tutorRequestSchema>;

/** What a provider must return for a tutor turn. Validated before anything is saved. */
export const tutorReplySchema = z.object({
  reply: safeText(MAX_TUTOR_REPLY_CHARS).trim().min(1),
});
export type TutorReply = z.infer<typeof tutorReplySchema>;

const quotaSchema = z.object({ used: z.number().int(), limit: z.number().int() });

export const tutorResponseSchema = z.object({
  message: z.object({
    id: z.uuid(),
    role: z.literal("tutor"),
    content: z.string(),
    createdAt: z.string(),
  }),
  quota: quotaSchema,
});
export type TutorResponse = z.infer<typeof tutorResponseSchema>;

// --- personal materials ------------------------------------------------------------------------

export const generatePersonalQuizRequestSchema = z.object({
  kind: materialKindSchema.exclude(["lesson"]).default("test"),
  count: z.number().int().min(1).max(20).default(6),
});
export type GeneratePersonalQuizRequest = z.infer<typeof generatePersonalQuizRequestSchema>;

/**
 * What is stored in materials.content for a personal material. There is no section, language or
 * grade (those describe the school curriculum, not a student's own topic) and no teacher source.
 */
export const personalContentSchema = z
  .object({
    objectives: z.array(objectiveRefSchema).min(1).max(30),
    lesson: lessonSchema.optional(),
    questions: z.array(questionSchema).max(100).optional(),
    generation: z.object({ provider: z.enum(["mock", "gemini"]) }).optional(),
  })
  .superRefine((content, ctx) => {
    const known = new Set(content.objectives.map((o) => o.id));
    const lists: [(string | number)[], { objectiveId: string }[]][] = [
      [["lesson", "checkQuestions"], content.lesson?.checkQuestions ?? []],
      [["questions"], content.questions ?? []],
    ];
    for (const [path, list] of lists) {
      list.forEach((q, index) => {
        if (!known.has(q.objectiveId)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, index, "objectiveId"],
            message: `objectiveId "${q.objectiveId}" is not in the material's objectives`,
          });
        }
      });
    }
  });
export type PersonalContent = z.infer<typeof personalContentSchema>;

/** The student's view of a personal material: no answer key until an attempt is submitted. */
export const personalMaterialViewSchema = z.object({
  id: z.uuid(),
  topicId: z.uuid(),
  kind: materialKindSchema,
  title: z.string(),
  objectives: z.array(objectiveRefSchema),
  lesson: z
    .object({
      body: z.string(),
      examples: z.array(z.object({ title: z.string(), body: z.string() })),
      checkQuestions: z.array(studentQuestionSchema),
    })
    .optional(),
  questions: z.array(studentQuestionSchema).optional(),
  createdAt: z.string(),
});
export type PersonalMaterialView = z.infer<typeof personalMaterialViewSchema>;

export const personalMaterialSummarySchema = z.object({
  id: z.uuid(),
  topicId: z.uuid(),
  kind: materialKindSchema,
  title: z.string(),
  createdAt: z.string(),
});
export const personalMaterialListResponseSchema = z.object({
  materials: z.array(personalMaterialSummarySchema),
});
export const personalMaterialResponseSchema = z.object({ material: personalMaterialViewSchema });
export const generatePersonalMaterialResponseSchema = z.object({
  material: personalMaterialViewSchema,
  quota: quotaSchema,
});

// --- adaptive policy ---------------------------------------------------------------------------

export const POLICY_REASON_CODES = ["REPEATED_OBJECTIVE_ERRORS", "HIGH_ACCURACY"] as const;
export type PolicyReasonCode = (typeof POLICY_REASON_CODES)[number];

export const topicPolicyResponseSchema = z.object({
  policy: policySchema,
  /** null when the policy is the built-in default (no row stored yet). */
  version: z.number().int().nullable(),
  /** Where it came from: this topic's own row, the student's global row, or the default. */
  source: z.enum(["topic", "global", "default"]),
  reasonCode: z.enum(POLICY_REASON_CODES).nullable(),
  note: z.string().nullable(),
});
export type TopicPolicyResponse = z.infer<typeof topicPolicyResponseSchema>;
