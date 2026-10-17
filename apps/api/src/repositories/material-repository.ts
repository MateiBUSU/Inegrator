import type { Prisma } from "../generated/prisma/client";
import { isForeignKeyViolation, isUniqueViolation } from "./prisma-errors";
import { prisma } from "./prisma-client";

/** The parent material already has a child with this version number. */
export class DuplicateVersionError extends Error {
  constructor() {
    super("Version already exists");
  }
}

/** A class in the list no longer exists (deleted while the request was running). */
export class UnknownClassError extends Error {
  constructor() {
    super("Class does not exist");
  }
}

export type MaterialKindValue = "lesson" | "test" | "problem" | "exercise";
export type MaterialStatusValue = "draft" | "published" | "archived";

export interface MaterialRecord {
  id: string;
  ownerId: string;
  scope: "class" | "personal";
  kind: MaterialKindValue;
  title: string;
  status: MaterialStatusValue;
  source: "manual" | "ai" | "document_based";
  subjectId: string | null;
  chapterId: string | null;
  /** Validated by the service layer; stored as jsonb. */
  content: unknown;
  version: number;
  parentId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
}

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

export async function createMaterial(data: {
  ownerId: string;
  kind: MaterialKindValue;
  title: string;
  subjectId: string | null;
  chapterId: string | null;
  content: unknown;
  version?: number;
  parentId?: string | null;
  /** Defaults to "manual". AI generation passes "ai" or "document_based". */
  source?: "manual" | "ai" | "document_based";
  basedOnDocumentIds?: string[];
}): Promise<MaterialRecord> {
  try {
    return await prisma.material.create({
      data: {
        ownerId: data.ownerId,
        scope: "class",
        source: data.source ?? "manual",
        basedOnDocumentIds: data.basedOnDocumentIds ?? [],
        status: "draft",
        kind: data.kind,
        title: data.title,
        subjectId: data.subjectId,
        chapterId: data.chapterId,
        content: toJson(data.content),
        version: data.version ?? 1,
        parentId: data.parentId ?? null,
      },
    });
  } catch (err) {
    // Besides the generated id, the only unique index is (parent_id, version).
    if (isUniqueViolation(err)) throw new DuplicateVersionError();
    throw err;
  }
}

export function findMaterialById(id: string): Promise<MaterialRecord | null> {
  return prisma.material.findUnique({ where: { id } });
}

export function listMaterialsByOwner(
  ownerId: string,
  status?: MaterialStatusValue,
): Promise<MaterialRecord[]> {
  return prisma.material.findMany({
    where: { ownerId, scope: "class", ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Compare-and-set update of a draft: applies only if the material is still a draft owned by
 * ownerId AND its content is still exactly what the caller validated. Returns false otherwise,
 * so a concurrent edit or publish can never be silently overwritten.
 */
export async function updateDraftIf(
  id: string,
  ownerId: string,
  expectedContent: unknown,
  data: { title: string; subjectId: string | null; chapterId: string | null; content: unknown },
): Promise<boolean> {
  const result = await prisma.material.updateMany({
    where: { id, ownerId, status: "draft", content: { equals: toJson(expectedContent) } },
    data: {
      title: data.title,
      subjectId: data.subjectId,
      chapterId: data.chapterId,
      content: toJson(data.content),
    },
  });
  return result.count === 1;
}

/** Same compare-and-set guard as updateDraftIf: publishes only the content that was checked. */
export async function publishIf(
  id: string,
  ownerId: string,
  expectedContent: unknown,
  publishedAt: Date,
): Promise<boolean> {
  const result = await prisma.material.updateMany({
    where: { id, ownerId, status: "draft", content: { equals: toJson(expectedContent) } },
    data: { status: "published", publishedAt },
  });
  return result.count === 1;
}

/** Which of these class ids belong to this teacher. */
export async function findClassIdsOwnedBy(
  teacherId: string,
  classIds: string[],
): Promise<string[]> {
  const rows = await prisma.class.findMany({
    where: { teacherId, id: { in: classIds } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** One statement, so either every assignment is created or none; re-assigning is a no-op. */
export async function assignToClasses(materialId: string, classIds: string[]): Promise<void> {
  try {
    await prisma.materialAssignment.createMany({
      data: classIds.map((classId) => ({ materialId, classId })),
      skipDuplicates: true,
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new UnknownClassError();
    throw err;
  }
}

/** True if the material is assigned to at least one class this student is enrolled in. */
export async function isAssignedToStudent(materialId: string, studentId: string): Promise<boolean> {
  const count = await prisma.materialAssignment.count({
    where: { materialId, class: { enrollments: { some: { studentId } } } },
  });
  return count > 0;
}
