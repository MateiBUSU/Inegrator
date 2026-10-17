import { beforeEach, describe, expect, it, vi } from "vitest";
import { tryConsumeAiQuota } from "./ai-usage-repository";

// Prisma is mocked only to pin the shape of the SQL: the quota must be consumed by ONE atomic
// statement (INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit), never read-then-write.
// Real concurrency behaviour is exercised against Postgres in the manual end-to-end run.
const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("./prisma-client", () => ({ prisma: prismaMock }));

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
});

describe("tryConsumeAiQuota", () => {
  it("issues a single atomic upsert with the limit inside the statement", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ count: 1 }]);
    expect(await tryConsumeAiQuota(USER, "2026-10-17", 20)).toBe(1);

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prismaMock.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join("?").replace(/\s+/g, " ");
    expect(sql).toContain("INSERT INTO ai_usage");
    expect(sql).toContain("ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1");
    expect(sql).toContain("WHERE ai_usage.count <");
    expect(sql).toContain("RETURNING count");
    expect(values).toEqual([USER, "2026-10-17", 20]);
  });

  it("returns null when the database did not update a row (limit reached)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    expect(await tryConsumeAiQuota(USER, "2026-10-17", 20)).toBeNull();
  });

  it("refuses without touching the database when the limit is below 1 or not an integer", async () => {
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(await tryConsumeAiQuota(USER, "2026-10-17", limit)).toBeNull();
    }
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});
