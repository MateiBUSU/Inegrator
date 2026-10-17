import { HttpError } from "../middleware/error-handler";
import { tryConsumeAiQuota } from "../repositories/ai-usage-repository";

/** The current UTC day as YYYY-MM-DD: the key of the daily quota. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Consumes one unit of a user's daily AI quota, atomically (see tryConsumeAiQuota). Teachers and
 * students use the same ai_usage counter with their own limits. A call that fails after this
 * point (e.g. AI unavailable) still counts: the budget caps attempts, not successes.
 * Over the limit: 429 QUOTA_EXCEEDED, the same error for both roles.
 */
export async function consumeAiQuota(
  userId: string,
  limit: number,
): Promise<{ used: number; limit: number }> {
  const used = await tryConsumeAiQuota(userId, utcDay(), limit);
  if (used === null) {
    throw new HttpError(
      429,
      "QUOTA_EXCEEDED",
      "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine.",
      { limit },
    );
  }
  return { used, limit };
}
