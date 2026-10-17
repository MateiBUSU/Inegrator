import type { TutorResponse } from "@app/shared";
import { getAiEngine } from "../ai";
import { TUTOR_HISTORY_MESSAGES } from "../config/adaptation";
import { env } from "../config/env";
import { appendExchange, listRecentMessages } from "../repositories/tutor-repository";
import { consumeAiQuota } from "./ai-quota";
import { getTopicPolicy } from "./policy-service";
import type { AuthContext } from "./token-service";
import { loadOwnedTopic } from "./topic-service";

/**
 * One tutor turn. The model sees the topic goal, the question, the last messages and the policy
 * fields, never the student's identity. Both messages are saved only after a validated reply, so
 * a failed turn leaves nothing behind (it still costs a unit of the daily quota).
 */
export async function askTutor(
  auth: AuthContext,
  topicId: string,
  message: string,
): Promise<TutorResponse> {
  const topic = await loadOwnedTopic(auth, topicId);

  // The engine first (a provider that cannot even start must not cost quota), then the quota.
  const engine = await getAiEngine();
  const recent = await listRecentMessages(auth.userId, topic.id, TUTOR_HISTORY_MESSAGES);
  const { policy } = await getTopicPolicy(auth.userId, topic.id);
  const quota = await consumeAiQuota(auth.userId, env.AI_DAILY_LIMIT_PER_STUDENT);

  const result = await engine.tutorReply({
    topicGoal: topic.goal,
    question: message,
    recentMessages: recent.map((entry) => ({ role: entry.role, content: entry.content })),
    policy,
  });

  const saved = await appendExchange({
    studentId: auth.userId,
    topicId: topic.id,
    userContent: message,
    tutorContent: result.reply,
  });
  return {
    message: {
      id: saved.id,
      role: "tutor",
      content: saved.content,
      createdAt: saved.createdAt.toISOString(),
    },
    quota,
  };
}
