import { prisma } from "../src/repositories/prisma-client";

async function main() {
  const [subjects, chapters, objectives] = await Promise.all([
    prisma.subject.count(),
    prisma.chapter.count(),
    prisma.objective.count(),
  ]);
  console.log(`subjects:   ${subjects}`);
  console.log(`chapters:   ${chapters}`);
  console.log(`objectives: ${objectives}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
