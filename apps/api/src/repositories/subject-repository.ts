import { prisma } from "./prisma-client";

export interface SubjectRecord {
  id: string;
  slug: string;
  title: string;
  section: "programa" | "bac";
  language: "cpp" | "python";
  grade: number | null;
}

export interface SubjectWithChapters extends SubjectRecord {
  chapters: {
    id: string;
    title: string;
    position: number;
    objectives: { id: string; code: string; text: string }[];
  }[];
}

export function listSubjects(): Promise<SubjectWithChapters[]> {
  return prisma.subject.findMany({
    orderBy: [{ section: "asc" }, { language: "asc" }, { grade: "asc" }],
    include: {
      chapters: {
        orderBy: { position: "asc" },
        include: {
          objectives: {
            orderBy: { code: "asc" },
            select: { id: true, code: true, text: true },
          },
        },
      },
    },
  });
}

export function findSubjectById(id: string): Promise<SubjectRecord | null> {
  return prisma.subject.findUnique({ where: { id } });
}

export function findChapterById(id: string): Promise<{ id: string; subjectId: string } | null> {
  return prisma.chapter.findUnique({ where: { id }, select: { id: true, subjectId: true } });
}

export interface ChapterWithObjectives {
  id: string;
  subjectId: string;
  title: string;
  objectives: { id: string; text: string }[];
}

/** A chapter with all of its (chapter-scoped) objectives, ordered by code. */
export function findChapterWithObjectives(id: string): Promise<ChapterWithObjectives | null> {
  return prisma.chapter.findUnique({
    where: { id },
    select: {
      id: true,
      subjectId: true,
      title: true,
      objectives: { orderBy: { code: "asc" }, select: { id: true, text: true } },
    },
  });
}
