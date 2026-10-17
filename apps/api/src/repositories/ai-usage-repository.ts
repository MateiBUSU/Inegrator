import { prisma } from "./prisma-client";

/**
 * Atomically consumes one unit of a user's AI quota for a UTC day (YYYY-MM-DD).
 *
 * One statement: INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING count.
 * The increment and the limit check happen together inside the database, so concurrent requests
 * can never push the counter past the limit (no read-then-write race). Returns the new count, or
 * null when the limit was already reached; in that case nothing is written.
 */
export async function tryConsumeAiQuota(
  userId: string,
  day: string,
  limit: number,
): Promise<number | null> {
  // The first insert writes count = 1, so a limit below 1 must be refused without touching it.
  if (!Number.isInteger(limit) || limit < 1) return null;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO ai_usage (user_id, day, count)
    VALUES (${userId}::uuid, ${day}::date, 1)
    ON CONFLICT (user_id, day)
    DO UPDATE SET count = ai_usage.count + 1
    WHERE ai_usage.count < ${limit}::int
    RETURNING count`;
  return rows[0]?.count ?? null;
}
