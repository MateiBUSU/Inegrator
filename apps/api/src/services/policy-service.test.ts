import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICY } from "@app/shared";
import { getEffectivePolicy } from "./policy-service";

// Only the Prisma client is faked, so the real repository query runs. The fake interprets the
// `where` and `orderBy` it is given, so a wrong query (wrong student, topic rows included, or the
// wrong sort) would return the wrong policy here.
interface Row {
  studentId: string;
  topicId: string | null;
  version: number;
  explanationLevel: string;
  exampleFirst: boolean;
  scaffolding: string;
  hintsEnabled: boolean;
  reasonCode: string | null;
}

const db = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock("../repositories/prisma-client", () => ({
  prisma: {
    studentPolicy: {
      findFirst: async (args: {
        where: { studentId: string; topicId: string | null };
        orderBy: { version: "asc" | "desc" };
        select: Record<string, true>;
      }) => {
        const matching = db.rows
          .filter((r) => r.studentId === args.where.studentId && r.topicId === args.where.topicId)
          .sort((a, b) =>
            args.orderBy.version === "desc" ? b.version - a.version : a.version - b.version,
          );
        const first = matching[0];
        if (!first) return null;
        return Object.fromEntries(
          Object.keys(args.select).map((key) => [key, first[key as keyof Row]]),
        );
      },
    },
  },
}));

const STUDENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TOPIC = "33333333-3333-4333-8333-333333333333";

const row = (over: Partial<Row>): Row => ({
  studentId: STUDENT,
  topicId: null,
  version: 1,
  explanationLevel: "standard",
  exampleFirst: false,
  scaffolding: "medium",
  hintsEnabled: true,
  reasonCode: null,
  ...over,
});

beforeEach(() => {
  db.rows = [];
});

describe("getEffectivePolicy", () => {
  it("returns the default constant when the student has no policy row", async () => {
    expect(await getEffectivePolicy(STUDENT)).toEqual(DEFAULT_POLICY);
  });

  it("returns the default for a student whose only rows belong to other students or topics", async () => {
    db.rows = [
      row({ studentId: OTHER, version: 5, explanationLevel: "advanced" }),
      row({ topicId: TOPIC, version: 3, scaffolding: "high" }),
    ];
    expect(await getEffectivePolicy(STUDENT)).toEqual(DEFAULT_POLICY);
  });

  it("returns the single row when only one version exists", async () => {
    db.rows = [row({ version: 1, explanationLevel: "basic", exampleFirst: true })];
    expect(await getEffectivePolicy(STUDENT)).toEqual({
      explanationLevel: "basic",
      exampleFirst: true,
      scaffolding: "medium",
      hintsEnabled: true,
    });
  });

  it("picks the highest version, whatever order the rows are stored in", async () => {
    db.rows = [
      row({ version: 2, explanationLevel: "standard", scaffolding: "medium" }),
      row({ version: 3, explanationLevel: "advanced", scaffolding: "low", hintsEnabled: false }),
      row({ version: 1, explanationLevel: "basic", scaffolding: "high" }),
    ];
    expect(await getEffectivePolicy(STUDENT)).toEqual({
      explanationLevel: "advanced",
      exampleFirst: false,
      scaffolding: "low",
      hintsEnabled: false,
    });
  });

  it("ignores topic-scoped rows and other students' rows even with higher versions", async () => {
    db.rows = [
      row({ version: 2, explanationLevel: "basic" }),
      row({ version: 9, topicId: TOPIC, explanationLevel: "advanced" }),
      row({ studentId: OTHER, version: 7, explanationLevel: "advanced" }),
    ];
    expect((await getEffectivePolicy(STUDENT)).explanationLevel).toBe("basic");
  });

  it("returns only the four policy fields: no student id, version or reason code", async () => {
    db.rows = [row({ version: 4, reasonCode: "struggles-with-loops" })];
    const policy = await getEffectivePolicy(STUDENT);
    expect(Object.keys(policy).sort()).toEqual([
      "exampleFirst",
      "explanationLevel",
      "hintsEnabled",
      "scaffolding",
    ]);
    expect(JSON.stringify(policy)).not.toContain(STUDENT);
    expect(JSON.stringify(policy)).not.toContain("struggles");
  });

  it("falls back to the default if the stored row no longer validates", async () => {
    db.rows = [row({ version: 2, explanationLevel: "expert" })];
    expect(await getEffectivePolicy(STUDENT)).toEqual(DEFAULT_POLICY);
  });
});
