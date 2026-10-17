import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMaterialsByOwner, listPublishedForStudent } from "./material-repository";
import {
  createPersonalMaterial,
  findPersonalMaterial,
  listPersonalMaterials,
} from "./personal-material-repository";
import { loadActivityFacts } from "./gamification-repository";
import { listTopicAttempts } from "./learning-stats-repository";
import { deleteTopicCascade } from "./topic-repository";

// Runs the REAL repository code against a fake Prisma client that evaluates `where` clauses on an
// in-memory table. The fixtures include rows the database constraints would normally forbid
// (a published, assigned personal material; a class material that has a topic id), so the only
// thing keeping the two sets apart is the `scope` condition in the repository query itself.
type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  materials: [] as Row[],
  attempts: [] as Row[],
  answers: [] as Row[],
  progress: [] as Row[],
  ops: [] as { op: string; args: unknown }[],
}));

/** Minimal Prisma `where` evaluator: equality, in, some, nested relations, OR. */
function matches(row: unknown, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === "OR") return (cond as Row[]).some((branch) => matches(row, branch));
    const value = (row as Row | undefined)?.[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Row;
      if ("in" in c) return (c.in as unknown[]).includes(value);
      if ("some" in c)
        return ((value as unknown[]) ?? []).some((item) => matches(item, c.some as Row));
      return matches(value, c);
    }
    return value === cond;
  });
}

vi.mock("./prisma-client", () => {
  const model = (name: string, table: () => Row[]) => ({
    findMany: async ({ where }: { where: Row }) => table().filter((row) => matches(row, where)),
    findFirst: async ({ where }: { where: Row }) =>
      table().find((row) => matches(row, where)) ?? null,
    findUnique: async ({ where }: { where: Row }) =>
      table().find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      table().push(row);
      return row;
    },
    count: async ({ where }: { where: Row }) => table().filter((row) => matches(row, where)).length,
    deleteMany: (args: unknown) => ({ op: `${name}.deleteMany`, args }),
    delete: (args: unknown) => ({ op: `${name}.delete`, args }),
  });
  return {
    prisma: {
      material: model("material", () => db.materials),
      materialAssignment: model("materialAssignment", () => []),
      quizAttempt: model("quizAttempt", () => db.attempts),
      lessonProgress: model("lessonProgress", () => db.progress),
      attemptAnswer: model("attemptAnswer", () => db.answers),
      recommendation: model("recommendation", () => []),
      learningTopic: model("learningTopic", () => []),
      $transaction: async (ops: { op: string; args: unknown }[]) => {
        db.ops.push(...ops);
        return ops;
      },
    },
  };
});

const student = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const teacher = "33333333-3333-4333-8333-333333333333";
const topic = "44444444-4444-4444-8444-444444444444";
const otherTopic = "55555555-5555-4555-8555-555555555555";
const classId = "66666666-6666-4666-8666-666666666666";

const enrolled = (studentId: string) => [{ classId, class: { enrollments: [{ studentId }] } }];

function row(overrides: Row): Row {
  return {
    id: crypto.randomUUID(),
    title: "t",
    kind: "test",
    status: "draft",
    content: {},
    createdAt: new Date(),
    topicId: null,
    assignments: [],
    ...overrides,
  };
}

let classMaterial: Row;
let personal: Row;
let hostilePersonal: Row;
let hostileClass: Row;

beforeEach(() => {
  db.materials.length = 0;
  db.attempts.length = 0;
  db.answers.length = 0;
  db.progress.length = 0;
  db.ops.length = 0;
  classMaterial = row({
    ownerId: teacher,
    scope: "class",
    status: "published",
    assignments: enrolled(student),
  });
  personal = row({ ownerId: student, scope: "personal", topicId: topic });
  // Forbidden by the database, so only the query's scope condition can exclude them:
  hostilePersonal = row({
    ownerId: student,
    scope: "personal",
    status: "published",
    topicId: topic,
    assignments: enrolled(student),
  });
  hostileClass = row({ ownerId: student, scope: "class", status: "draft", topicId: topic });
  db.materials.push(classMaterial, personal, hostilePersonal, hostileClass);
});

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("class queries never return personal materials", () => {
  it("listPublishedForStudent returns the class material only, even for a published, assigned personal row", async () => {
    const result = await listPublishedForStudent(student);
    expect(ids(result as unknown as Row[])).toEqual([classMaterial.id]);
    expect(ids((await listPublishedForStudent(student, classId)) as unknown as Row[])).toEqual([
      classMaterial.id,
    ]);
  });

  it("listMaterialsByOwner (the teacher/owner listing) never includes personal rows of the same owner", async () => {
    const result = await listMaterialsByOwner(student);
    expect(ids(result as unknown as Row[])).toEqual([hostileClass.id]);
    expect(ids((await listMaterialsByOwner(teacher)) as unknown as Row[])).toEqual([
      classMaterial.id,
    ]);
  });
});

describe("personal queries never return class materials", () => {
  it("lists the owner's personal materials of one topic only", async () => {
    const other = row({ ownerId: stranger, scope: "personal", topicId: topic });
    const elsewhere = row({ ownerId: student, scope: "personal", topicId: otherTopic });
    db.materials.push(other, elsewhere);

    const result = await listPersonalMaterials(student, topic);
    expect(ids(result as unknown as Row[]).sort()).toEqual(
      [personal.id, hostilePersonal.id].sort(),
    );
    expect(ids(result as unknown as Row[])).not.toContain(hostileClass.id);
    expect(ids(result as unknown as Row[])).not.toContain(classMaterial.id);
    expect(ids(result as unknown as Row[])).not.toContain(other.id);
    expect(ids(result as unknown as Row[])).not.toContain(elsewhere.id);
  });

  it("finds a personal material only for its owner, in its own topic, with personal scope", async () => {
    expect(await findPersonalMaterial(student, topic, String(personal.id))).not.toBeNull();
    expect(await findPersonalMaterial(student, topic, String(hostileClass.id))).toBeNull();
    expect(await findPersonalMaterial(student, topic, String(classMaterial.id))).toBeNull();
    expect(await findPersonalMaterial(stranger, topic, String(personal.id))).toBeNull();
    expect(await findPersonalMaterial(student, otherTopic, String(personal.id))).toBeNull();
  });

  it("creates materials with scope personal, the owner and the topic (never class)", async () => {
    const created = await createPersonalMaterial({
      ownerId: student,
      topicId: topic,
      kind: "lesson",
      title: "L",
      content: {},
    });
    const stored = db.materials.find((m) => m.id === created.id);
    expect(stored).toMatchObject({ scope: "personal", ownerId: student, topicId: topic });
    // No status is set: the database default (draft) applies, and nothing ever publishes it.
    expect(stored).not.toHaveProperty("status");
  });

  it("topic attempts for the adaptive policy only count personal materials of that topic", async () => {
    db.attempts.push({
      studentId: student,
      material: personal,
      submittedAt: new Date(),
      score: 1,
      maxScore: 1,
      answers: [],
    });
    // The fake attempt table is matched on the same `material` relation the query names.
    const rows = await listTopicAttempts(student, topic, 30);
    expect(rows).toHaveLength(1);
    db.attempts.length = 0;
    db.attempts.push({
      studentId: student,
      material: classMaterial,
      submittedAt: new Date(),
      score: 1,
      maxScore: 1,
      answers: [],
    });
    expect(await listTopicAttempts(student, topic, 30)).toHaveLength(0);
  });
});

describe("gamification counts class activity only", () => {
  it("ignores personal attempts, answers and progress (teacher view and farming)", async () => {
    const at = (day: number) => new Date(Date.UTC(2026, 9, day));
    const attempt = (material: Row, day: number): Row => ({
      studentId: student,
      material,
      submittedAt: at(day),
    });
    const classAttempt = attempt(classMaterial, 1);
    const personalAttempt = attempt(personal, 2);
    db.attempts.push(classAttempt, personalAttempt, attempt(personal, 3));
    db.answers.push(
      { isCorrect: true, attempt: classAttempt },
      { isCorrect: false, attempt: classAttempt },
      { isCorrect: true, attempt: personalAttempt },
      { isCorrect: true, attempt: personalAttempt },
      { isCorrect: false, attempt: personalAttempt },
    );
    db.progress.push(
      { studentId: student, status: "completed", updatedAt: at(1), material: classMaterial },
      { studentId: student, status: "completed", updatedAt: at(2), material: personal },
    );

    const facts = await loadActivityFacts(student);
    expect(facts.attemptDates).toEqual([at(1)]);
    expect(facts.answers).toEqual({ correct: 1, incorrect: 1 });
    expect(facts.lessons).toHaveLength(1);
  });
});

describe("deleting a topic", () => {
  it("removes the rows that block the foreign keys first, then the topic, in one transaction", async () => {
    await deleteTopicCascade(topic);
    expect(db.ops.map((o) => o.op)).toEqual([
      "quizAttempt.deleteMany",
      "lessonProgress.deleteMany",
      "recommendation.deleteMany",
      "learningTopic.delete",
    ]);
    expect(db.ops[0]?.args).toEqual({ where: { material: { topicId: topic } } });
    expect(db.ops[3]?.args).toEqual({ where: { id: topic } });
  });
});

describe("migration 20261017200000_personal_space", () => {
  const sql = readFileSync(
    join(__dirname, "../../prisma/migrations/20261017200000_personal_space/migration.sql"),
    "utf8",
  );
  const schema = readFileSync(join(__dirname, "../../prisma/schema.prisma"), "utf8");

  it("cascades topic -> materials and topic -> student_policies instead of SET NULL", () => {
    for (const table of ["materials", "student_policies"]) {
      expect(sql).toMatch(
        new RegExp(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_topic_id_fkey"\\s+FOREIGN KEY \\("topic_id"\\) REFERENCES "learning_topics"\\("id"\\) ON DELETE CASCADE`,
        ),
      );
      expect(sql).toContain(`DROP CONSTRAINT "${table}_topic_id_fkey"`);
    }
  });

  it("adds the note column, and the Prisma schema agrees with the SQL", () => {
    expect(sql).toContain('ADD COLUMN "note" TEXT');
    expect(schema).toMatch(/note\s+String\?/);
    // Checked per model: other models already cascade, so a loose match would pass by accident.
    for (const model of ["Material", "StudentPolicy"]) {
      const block = schema.slice(schema.indexOf(`model ${model} {`)).split("\n}")[0] ?? "";
      expect(block, model).toMatch(
        /topic\s+LearningTopic\??\s+@relation\(fields: \[topicId\], references: \[id\], onDelete: Cascade\)/,
      );
    }
  });
});
