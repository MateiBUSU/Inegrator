import {
  generatePersonalMaterialResponseSchema,
  personalMaterialListResponseSchema,
  personalMaterialResponseSchema,
  topicListResponseSchema,
  topicPolicyResponseSchema,
  topicResponseSchema,
  tutorMessagesResponseSchema,
  tutorResponseSchema,
  type CreateTopicRequest,
  type GeneratePersonalQuizRequest,
  type PersonalMaterialView,
  type Topic,
  type TopicPolicyResponse,
  type TutorMessage,
  type TutorResponse,
} from "@app/shared";
import type { z } from "zod";
import { request } from "./client";

// The student's personal learning space (/api/me/topics). Students only; the student is the
// session's user, never an id in the URL.

export type PersonalMaterialSummary = z.infer<
  typeof personalMaterialListResponseSchema
>["materials"][number];
export type GeneratedPersonalMaterial = z.infer<typeof generatePersonalMaterialResponseSchema>;

const topicPath = (id: string) => `/me/topics/${encodeURIComponent(id)}`;

/** GET /api/me/topics */
export async function listTopics(): Promise<Topic[]> {
  const { topics } = await request("GET", "/me/topics", { schema: topicListResponseSchema });
  return topics;
}

/** GET /api/me/topics/:id (404 for a topic that is not the student's own) */
export async function getTopic(id: string): Promise<Topic> {
  const { topic } = await request("GET", topicPath(id), { schema: topicResponseSchema });
  return topic;
}

/** POST /api/me/topics */
export async function createTopic(body: CreateTopicRequest): Promise<Topic> {
  const { topic } = await request("POST", "/me/topics", { body, schema: topicResponseSchema });
  return topic;
}

/** DELETE /api/me/topics/:id (also deletes the topic's chat, materials and attempts) */
export function deleteTopic(id: string): Promise<void> {
  return request("DELETE", topicPath(id));
}

/** GET /api/me/topics/:id/policy */
export function getPolicy(id: string): Promise<TopicPolicyResponse> {
  return request("GET", `${topicPath(id)}/policy`, { schema: topicPolicyResponseSchema });
}

/** GET /api/me/topics/:id/tutor-messages: the last 50 messages, oldest first. */
export async function listTutorMessages(id: string): Promise<TutorMessage[]> {
  const { messages } = await request("GET", `${topicPath(id)}/tutor-messages`, {
    schema: tutorMessagesResponseSchema,
  });
  return messages;
}

/** POST /api/me/topics/:id/tutor */
export function askTutor(id: string, message: string): Promise<TutorResponse> {
  return request("POST", `${topicPath(id)}/tutor`, {
    body: { message },
    schema: tutorResponseSchema,
  });
}

/** POST /api/me/topics/:id/lesson */
export function generateLesson(id: string): Promise<GeneratedPersonalMaterial> {
  return request("POST", `${topicPath(id)}/lesson`, {
    schema: generatePersonalMaterialResponseSchema,
  });
}

/** POST /api/me/topics/:id/quiz */
export function generateQuiz(
  id: string,
  body: Partial<GeneratePersonalQuizRequest> = {},
): Promise<GeneratedPersonalMaterial> {
  return request("POST", `${topicPath(id)}/quiz`, {
    body,
    schema: generatePersonalMaterialResponseSchema,
  });
}

/** GET /api/me/topics/:id/materials */
export async function listMaterials(id: string): Promise<PersonalMaterialSummary[]> {
  const { materials } = await request("GET", `${topicPath(id)}/materials`, {
    schema: personalMaterialListResponseSchema,
  });
  return materials;
}

/** GET /api/me/topics/:id/materials/:materialId (no answer key). */
export async function getMaterial(id: string, materialId: string): Promise<PersonalMaterialView> {
  const { material } = await request(
    "GET",
    `${topicPath(id)}/materials/${encodeURIComponent(materialId)}`,
    { schema: personalMaterialResponseSchema },
  );
  return material;
}
