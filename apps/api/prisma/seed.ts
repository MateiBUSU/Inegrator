import { readFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../src/repositories/prisma-client";

const curriculumSchema = z.object({
  subjects: z.array(
    z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      section: z.enum(["programa", "bac"]),
      language: z.enum(["cpp", "python"]),
      grade: z.number().int().nullable(),
      chapters: z.array(
        z.object({
          position: z.number().int().min(1),
          title: z.string().min(1),
          objectives: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })),
        }),
      ),
    }),
  ),
});

async function main() {
  const raw = await readFile(new URL("./seed-data/curriculum.json", import.meta.url), "utf8");
  const curriculum = curriculumSchema.parse(JSON.parse(raw));

  for (const subject of curriculum.subjects) {
    const { chapters, ...subjectData } = subject;
    const savedSubject = await prisma.subject.upsert({
      where: { slug: subject.slug },
      update: subjectData,
      create: subjectData,
    });

    for (const chapter of chapters) {
      const savedChapter = await prisma.chapter.upsert({
        where: { subjectId_position: { subjectId: savedSubject.id, position: chapter.position } },
        update: { title: chapter.title },
        create: { subjectId: savedSubject.id, position: chapter.position, title: chapter.title },
      });

      for (const objective of chapter.objectives) {
        // (chapter_id, code) is a partial unique index, which Prisma cannot upsert on.
        const existing = await prisma.objective.findFirst({
          where: { chapterId: savedChapter.id, code: objective.code },
          select: { id: true },
        });
        if (existing) {
          await prisma.objective.update({
            where: { id: existing.id },
            data: { text: objective.text },
          });
        } else {
          await prisma.objective.create({
            data: { chapterId: savedChapter.id, code: objective.code, text: objective.text },
          });
        }
      }
    }
  }

  console.log(`Seeded ${curriculum.subjects.length} subjects.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
