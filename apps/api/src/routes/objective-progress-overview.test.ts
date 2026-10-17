import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { signToken } from "../services/token-service";

// Teacher view of per-student objective progress. Repositories are in-memory fakes that follow
// the same scope rules as the real queries.
const store = vi.hoisted(() => {
  const id = () => crypto.randomUUID();
  return {
    ids: { teacherA: id(), teacherB: id(), material: id(), obj1: id(), obj2: id() },
    students: [] as { id: string; name: string; className: string }[],
    progress: [] as {
      studentId: string;
      objectiveId: string;
      status: "not_started" | "struggling" | "mastered";
      attemptsCount: number;
      strategiesTried: string[];
      currentExplanation: string | null;
      helpRequestedAt: Date | null;
      updatedAt: Date;
    }[],
  };
});
const { ids } = store;

vi.mock("../repositories/material-repository", () => ({
  findMaterialById: async (id: string) =>
    id === ids.material
      ? {
          id,
          ownerId: ids.teacherA,
          scope: "class",
          kind: "test",
          title: "Funcții",
          status: "published",
          source: "manual",
          subjectId: null,
          chapterId: null,
          topicId: null,
          version: 1,
          parentId: null,
          createdAt: new Date(),
          publishedAt: new Date(),
          content: {
            section: "programa",
            language: "cpp",
            grade: 9,
            // one catalogue objective (uuid), one material-local id that must be left out
            objectives: [
              { id: ids.obj1, text: "Definește funcții" },
              { id: ids.obj2, text: "Transmite parametri" },
              { id: "o-local", text: "Local" },
            ],
            questions: [
              {
                id: "q1",
                type: "short",
                prompt: "Cum?",
                acceptedAnswers: ["x"],
                objectiveId: ids.obj1,
                verification: "unchecked",
              },
            ],
          },
        }
      : null,
}));

vi.mock("../repositories/practice-repository", () => ({
  listStudentsOfMaterial: async () =>
    store.students.map((s) => ({ studentId: s.id, displayName: s.name, className: s.className })),
  listProgressForStudents: async (studentIds: string[], objectiveIds: string[]) =>
    store.progress.filter(
      (p) => studentIds.includes(p.studentId) && objectiveIds.includes(p.objectiveId),
    ),
}));

const cookieOf = (id: string, role: "teacher" | "student") =>
  `token=${signToken({ userId: id, role })}`;
const get = (cookie: string | null, id = ids.material) => {
  const req = request(createApp()).get(`/api/materials/${id}/objective-progress`);
  return cookie ? req.set("Cookie", cookie) : req;
};

beforeEach(() => {
  store.students.length = 0;
  store.progress.length = 0;
});

describe("GET /api/materials/:id/objective-progress", () => {
  it("returns each student's own rows: nothing is averaged or merged", async () => {
    const ana = { id: crypto.randomUUID(), name: "Ana", className: "9A" };
    const bob = { id: crypto.randomUUID(), name: "Bob", className: "9A" };
    const cris = { id: crypto.randomUUID(), name: "Cris", className: "9B" };
    store.students.push(ana, bob, cris);
    store.progress.push(
      {
        studentId: ana.id,
        objectiveId: ids.obj1,
        status: "mastered",
        attemptsCount: 3,
        strategiesTried: ["ANALOGIE", "PAS_CU_PAS"],
        currentExplanation: "PRIVATE-TEXT",
        helpRequestedAt: null,
        updatedAt: new Date(),
      },
      {
        studentId: bob.id,
        objectiveId: ids.obj1,
        status: "struggling",
        attemptsCount: 6,
        strategiesTried: ["ANALOGIE", "PAS_CU_PAS", "EXEMPLU_LUCRAT"],
        currentExplanation: null,
        helpRequestedAt: new Date("2026-10-18T09:00:00.000Z"),
        updatedAt: new Date(),
      },
    );

    const res = await get(cookieOf(ids.teacherA, "teacher"));
    expect(res.status).toBe(200);
    expect(res.body.objectives.map((o: { id: string }) => o.id)).toEqual([ids.obj1, ids.obj2]);
    const rows = Object.fromEntries(
      res.body.students.map((s: { displayName: string }) => [s.displayName, s]),
    );
    expect(res.body.students).toHaveLength(3);
    expect(rows.Ana.objectives[0]).toEqual({
      objectiveId: ids.obj1,
      status: "mastered",
      attemptsCount: 3,
      strategiesTried: ["ANALOGIE", "PAS_CU_PAS"],
      helpRequestedAt: null,
    });
    expect(rows.Bob.objectives[0]).toEqual({
      objectiveId: ids.obj1,
      status: "struggling",
      attemptsCount: 6,
      strategiesTried: ["ANALOGIE", "PAS_CU_PAS", "EXEMPLU_LUCRAT"],
      // The teacher sees who asked for help, per student, and only that student.
      helpRequestedAt: "2026-10-18T09:00:00.000Z",
    });
    // A student who never practiced still has a row, as not_started with zeros.
    expect(rows.Cris.objectives).toEqual([
      {
        objectiveId: ids.obj1,
        status: "not_started",
        attemptsCount: 0,
        strategiesTried: [],
        helpRequestedAt: null,
      },
      {
        objectiveId: ids.obj2,
        status: "not_started",
        attemptsCount: 0,
        strategiesTried: [],
        helpRequestedAt: null,
      },
    ]);
    expect(rows.Cris.classNames).toEqual(["9B"]);
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE-TEXT");
  });

  it("lists a student once even when enrolled in two classes with the material", async () => {
    const ana = { id: crypto.randomUUID(), name: "Ana", className: "9A" };
    store.students.push(ana, { ...ana, className: "9B" });
    const res = await get(cookieOf(ids.teacherA, "teacher"));
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].classNames).toEqual(["9A", "9B"]);
  });

  it("another teacher gets 404, a student 403, anonymous 401, an unknown material 404", async () => {
    store.students.push({ id: crypto.randomUUID(), name: "Ana", className: "9A" });
    const other = await get(cookieOf(ids.teacherB, "teacher"));
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe("MATERIAL_NOT_FOUND");
    expect(JSON.stringify(other.body)).not.toContain("Ana");
    expect((await get(cookieOf(crypto.randomUUID(), "student"))).status).toBe(403);
    expect((await get(null)).status).toBe(401);
    expect((await get(cookieOf(ids.teacherA, "teacher"), crypto.randomUUID())).status).toBe(404);
  });
});
