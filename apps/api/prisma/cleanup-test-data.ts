import { prisma } from "../src/repositories/prisma-client";

// Deletes the throwaway accounts created by manual walkthroughs and E2E scripts, and everything
// that belongs to them, from the LOCAL development database. Dry run unless --apply is passed.
//
//   npm run db:cleanup-test-data -w @app/api            (lists what would be deleted)
//   npm run db:cleanup-test-data -w @app/api -- --apply (deletes it)
//
// A user is "synthetic" only if its email matches one of the patterns below. Seed data
// (subjects, chapters, objectives) is never touched, and neither are other accounts.
const SYNTHETIC_EMAILS = [
  { endsWith: "@walk.test" }, // walkthrough scripts (stages 9-11)
  { endsWith: "@smoke.test" }, // the stage 11e smoke script
  // Early E2E accounts: t/s/o + a millisecond timestamp @example.com (Prof E2E, Elev E2E, Alt elev)
  { endsWith: "@example.com", startsWith: "t17" },
  { endsWith: "@example.com", startsWith: "s17" },
  { endsWith: "@example.com", startsWith: "o17" },
];

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl)) {
    throw new Error("Refusing to run: this script only works on a local development database.");
  }
  const apply = process.argv.includes("--apply");

  const users = await prisma.user.findMany({
    where: { OR: SYNTHETIC_EMAILS.map((rule) => ({ email: rule })) },
    select: { id: true, email: true, role: true, displayName: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = users.map((u) => u.id);
  console.log(`${apply ? "DELETING" : "Dry run:"} ${users.length} synthetic user(s)`);
  for (const u of users) console.log(`  ${u.role.padEnd(7)} ${u.email}  (${u.displayName})`);
  if (users.length === 0) return;

  const materials = await prisma.material.findMany({
    where: { ownerId: { in: userIds } },
    select: { id: true },
  });
  const materialIds = materials.map((m) => m.id);
  const classes = await prisma.class.findMany({
    where: { teacherId: { in: userIds } },
    select: { id: true },
  });
  const classIds = classes.map((c) => c.id);

  const counts: Record<string, number> = {};

  // Children before parents; most rows under a user cascade, the rest are removed explicitly.
  const steps: [string, (db: Tx) => Promise<{ count: number }>][] = [
    [
      "quiz_attempts",
      (db) =>
        db.quizAttempt.deleteMany({
          where: { OR: [{ studentId: { in: userIds } }, { materialId: { in: materialIds } }] },
        }),
    ],
    [
      "lesson_progress",
      (db) =>
        db.lessonProgress.deleteMany({
          where: { OR: [{ studentId: { in: userIds } }, { materialId: { in: materialIds } }] },
        }),
    ],
    [
      "recommendations",
      (db) =>
        db.recommendation.deleteMany({
          where: { OR: [{ studentId: { in: userIds } }, { materialId: { in: materialIds } }] },
        }),
    ],
    [
      "objective_stats",
      (db) => db.objectiveStat.deleteMany({ where: { studentId: { in: userIds } } }),
    ],
    [
      "student_policies",
      (db) => db.studentPolicy.deleteMany({ where: { studentId: { in: userIds } } }),
    ],
    ["ai_usage", (db) => db.aiUsage.deleteMany({ where: { userId: { in: userIds } } })],
    [
      "material_assignments",
      (db) =>
        db.materialAssignment.deleteMany({
          where: { OR: [{ materialId: { in: materialIds } }, { classId: { in: classIds } }] },
        }),
    ],
    [
      "enrollments",
      (db) =>
        db.enrollment.deleteMany({
          where: { OR: [{ classId: { in: classIds } }, { studentId: { in: userIds } }] },
        }),
    ],
    // Newest versions first so the parent_id self-reference never blocks the delete.
    [
      "materials",
      async (db) => {
        await db.material.updateMany({
          where: { id: { in: materialIds } },
          data: { parentId: null },
        });
        return db.material.deleteMany({ where: { id: { in: materialIds } } });
      },
    ],
    [
      "teacher_documents",
      (db) => db.teacherDocument.deleteMany({ where: { teacherId: { in: userIds } } }),
    ],
    ["classes", (db) => db.class.deleteMany({ where: { id: { in: classIds } } })],
    // Cascades: learning_topics (+ their objectives, tutor messages), objective_progress,
    // practice_exercises, practice_attempts.
    ["users", (db) => db.user.deleteMany({ where: { id: { in: userIds } } })],
  ];

  if (!apply) {
    console.log(
      `Would also delete: ${materialIds.length} material(s), ${classIds.length} class(es)`,
    );
    console.log("Run again with --apply to delete.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const [label, op] of steps) counts[label] = (await op(tx)).count;
  });
  console.log("Deleted rows:");
  console.table(counts);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
