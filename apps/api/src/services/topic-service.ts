import type { CreateTopicRequest, Topic } from "@app/shared";
import { MAX_TOPICS_PER_STUDENT } from "../config/adaptation";
import { HttpError } from "../middleware/error-handler";
import {
  countTopicsByStudent,
  createTopic,
  deleteTopicCascade,
  findTopicById,
  listTopicsByStudent,
  type TopicRecord,
} from "../repositories/topic-repository";
import type { AuthContext } from "./token-service";

export function assertStudent(auth: AuthContext): void {
  if (auth.role !== "student") {
    throw new HttpError(403, "FORBIDDEN", "Nu ai permisiunea să accesezi această resursă.");
  }
}

// Someone else's topic is indistinguishable from one that does not exist.
const topicNotFound = () => new HttpError(404, "TOPIC_NOT_FOUND", "Subiectul nu a fost găsit.");

function toTopic(record: TopicRecord): Topic {
  return {
    id: record.id,
    title: record.title,
    goal: record.goal,
    createdAt: record.createdAt.toISOString(),
  };
}

/** The topic, only if it belongs to this student (otherwise 404). Identity: the session only. */
export async function loadOwnedTopic(auth: AuthContext, topicId: string): Promise<TopicRecord> {
  assertStudent(auth);
  const found = await findTopicById(topicId);
  if (!found || found.studentId !== auth.userId) throw topicNotFound();
  return found;
}

export async function createOwnTopic(auth: AuthContext, input: CreateTopicRequest): Promise<Topic> {
  assertStudent(auth);
  if ((await countTopicsByStudent(auth.userId)) >= MAX_TOPICS_PER_STUDENT) {
    throw new HttpError(
      409,
      "TOPIC_LIMIT_REACHED",
      `Poți avea cel mult ${MAX_TOPICS_PER_STUDENT} subiecte. Șterge unul pentru a adăuga altul.`,
    );
  }
  return toTopic(
    await createTopic({ studentId: auth.userId, title: input.title, goal: input.goal }),
  );
}

export async function listOwnTopics(auth: AuthContext): Promise<Topic[]> {
  assertStudent(auth);
  return (await listTopicsByStudent(auth.userId)).map(toTopic);
}

export async function deleteOwnTopic(auth: AuthContext, topicId: string): Promise<void> {
  const topic = await loadOwnedTopic(auth, topicId);
  await deleteTopicCascade(topic.id);
}
