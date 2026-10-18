import {
  personalContentSchema,
  personalMaterialViewSchema,
  toStudentQuestion,
  type GeneratePersonalQuizRequest,
  type PersonalMaterialView,
} from "@app/shared";
import { AiUnavailableError, getAiEngine } from "../ai";
import { env } from "../config/env";
import { HttpError } from "../middleware/error-handler";
import {
  createPersonalMaterial,
  findPersonalMaterial,
  listPersonalMaterials,
  type PersonalMaterialRecord,
} from "../repositories/personal-material-repository";
import { findTopicObjective } from "../repositories/topic-repository";
import { consumeAiQuota } from "./ai-quota";
import { getTopicPolicy } from "./policy-service";
import type { AuthContext } from "./token-service";
import { loadOwnedTopic } from "./topic-service";

// Personal materials have no publish, confirm or version workflow: those are class concepts
// (a teacher vouches for the answer key). The student can use a material as soon as it has been
// generated and validated. Its answer key comes from the AI and is NOT teacher-confirmed, so
// every question is stored as "unchecked" and scores on personal quizzes are practice only.

const MAX_OBJECTIVE_CHARS = 500;
const KIND_LABEL = {
  lesson: "Lecție",
  test: "Test",
  problem: "Probleme",
  exercise: "Exerciții",
} as const;

const materialNotFound = () =>
  new HttpError(404, "MATERIAL_NOT_FOUND", "Materialul nu a fost găsit.");

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** The only way a personal material is shown: whitelisted fields, no answer key. */
export function toPersonalView(record: PersonalMaterialRecord): PersonalMaterialView {
  const content = personalContentSchema.parse(record.content);
  return personalMaterialViewSchema.parse({
    id: record.id,
    topicId: record.topicId,
    kind: record.kind,
    title: record.title,
    objectives: content.objectives,
    ...(content.lesson
      ? {
          lesson: {
            body: content.lesson.body,
            examples: content.lesson.examples.map((e) => ({ title: e.title, body: e.body })),
            checkQuestions: content.lesson.checkQuestions.map(toStudentQuestion),
          },
        }
      : {}),
    ...(content.questions ? { questions: content.questions.map(toStudentQuestion) } : {}),
    ...(content.generation ? { provider: content.generation.provider } : {}),
    createdAt: record.createdAt.toISOString(),
  });
}

/**
 * Generates a personal lesson or quiz for one of the student's own topics. "Personal mode": no
 * teacher document chunks, no style notes, the student's own policy for this topic, and the
 * safety rules for security topics in the system prompt.
 */
async function generate(
  auth: AuthContext,
  topicId: string,
  request: { kind: "lesson" } | GeneratePersonalQuizRequest,
): Promise<{ material: PersonalMaterialView; quota: { used: number; limit: number } }> {
  const topic = await loadOwnedTopic(auth, topicId);
  const objective = await findTopicObjective(topic.id);
  if (!objective) {
    throw new HttpError(409, "TOPIC_NOT_READY", "Subiectul nu are un obiectiv de învățare.");
  }

  // The engine first, then the quota (same order and same 429 as the teacher's generation).
  const engine = await getAiEngine();
  const { policy } = await getTopicPolicy(auth.userId, topic.id);
  const quota = await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);

  const objectives = [{ id: objective.id, text: clip(objective.text, MAX_OBJECTIVE_CHARS) }];
  const context = {
    subjectTitle: "Studiu individual",
    chapterTitle: topic.title,
    objectives,
    sourceChunks: [],
    styleNotes: null,
    policy,
    mode: "personal" as const,
  };

  const kind = request.kind;
  const generated =
    request.kind === "lesson"
      ? { lesson: (await engine.generateLesson(context)).lesson }
      : {
          questions: (
            await engine.generateQuiz({ ...context, count: request.count, kind: request.kind })
          ).questions,
        };

  // Nothing is saved unless the whole content validates.
  const parsed = personalContentSchema.safeParse({
    objectives,
    ...generated,
    generation: { provider: engine.provider },
  });
  if (!parsed.success) throw new AiUnavailableError();

  const record = await createPersonalMaterial({
    ownerId: auth.userId,
    topicId: topic.id,
    kind,
    title: clip(`${KIND_LABEL[kind]}: ${topic.title}`, 200),
    content: parsed.data,
  });
  return { material: toPersonalView(record), quota };
}

export const generatePersonalLesson = (auth: AuthContext, topicId: string) =>
  generate(auth, topicId, { kind: "lesson" });

export const generatePersonalQuiz = (
  auth: AuthContext,
  topicId: string,
  input: GeneratePersonalQuizRequest,
) => generate(auth, topicId, input);

export async function listTopicMaterials(auth: AuthContext, topicId: string) {
  const topic = await loadOwnedTopic(auth, topicId);
  const records = await listPersonalMaterials(auth.userId, topic.id);
  return records.map((record) => ({
    id: record.id,
    topicId: record.topicId,
    kind: record.kind,
    title: record.title,
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function getTopicMaterial(
  auth: AuthContext,
  topicId: string,
  materialId: string,
): Promise<PersonalMaterialView> {
  const topic = await loadOwnedTopic(auth, topicId);
  const record = await findPersonalMaterial(auth.userId, topic.id, materialId);
  if (!record) throw materialNotFound();
  return toPersonalView(record);
}
