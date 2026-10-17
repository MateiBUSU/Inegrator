import { isForeignKeyViolation } from "./prisma-errors";
import { prisma } from "./prisma-client";

/** The class was deleted while the request was running. */
export class ClassGoneError extends Error {
  constructor() {
    super("Class does not exist");
  }
}

export interface DocumentSummaryRecord {
  id: string;
  title: string;
  createdAt: Date;
  chunkCount: number;
}

export interface DocumentOwnerRecord {
  id: string;
  classId: string;
  /** Owner of the class the document belongs to (authoritative for authorization). */
  classTeacherId: string;
}

export interface ClassChunkRecord {
  classId: string;
  documentId: string;
  documentCreatedAt: Date;
  position: number;
  text: string;
}

/** Document and all its chunks are written in one nested create, so both exist or neither. */
export async function createDocumentWithChunks(data: {
  classId: string;
  teacherId: string;
  title: string;
  chunks: string[];
}): Promise<DocumentSummaryRecord> {
  try {
    const row = await prisma.teacherDocument.create({
      data: {
        classId: data.classId,
        teacherId: data.teacherId,
        title: data.title,
        sourceType: "pasted",
        chunks: { createMany: { data: data.chunks.map((text, position) => ({ position, text })) } },
      },
      select: { id: true, title: true, createdAt: true },
    });
    return { ...row, chunkCount: data.chunks.length };
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new ClassGoneError();
    throw err;
  }
}

export function countDocumentsByClass(classId: string): Promise<number> {
  return prisma.teacherDocument.count({ where: { classId } });
}

export async function listDocumentsByClass(classId: string): Promise<DocumentSummaryRecord[]> {
  const rows = await prisma.teacherDocument.findMany({
    where: { classId },
    select: { id: true, title: true, createdAt: true, _count: { select: { chunks: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    chunkCount: row._count.chunks,
  }));
}

export async function findDocumentOwner(id: string): Promise<DocumentOwnerRecord | null> {
  const row = await prisma.teacherDocument.findUnique({
    where: { id },
    select: { id: true, classId: true, class: { select: { teacherId: true } } },
  });
  return row ? { id: row.id, classId: row.classId, classTeacherId: row.class.teacherId } : null;
}

/** Chunks cascade via the foreign key. Returns false if the document was already gone. */
export async function deleteDocument(id: string): Promise<boolean> {
  const result = await prisma.teacherDocument.deleteMany({ where: { id } });
  return result.count === 1;
}

/** Which of these document ids belong to this class. */
export async function findDocumentIdsInClass(
  classId: string,
  documentIds: string[],
): Promise<string[]> {
  const rows = await prisma.teacherDocument.findMany({
    where: { classId, id: { in: documentIds } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** Every chunk of the documents of this class, and only this class. */
export async function listChunksForClass(
  classId: string,
  options: { take?: number } = {},
): Promise<ClassChunkRecord[]> {
  const rows = await prisma.documentChunk.findMany({
    where: { document: { classId } },
    select: {
      documentId: true,
      position: true,
      text: true,
      document: { select: { classId: true, createdAt: true } },
    },
    // Document order (oldest first), then position: also what "the first N chunks" means.
    orderBy: [{ document: { createdAt: "asc" } }, { documentId: "asc" }, { position: "asc" }],
    ...(options.take !== undefined ? { take: options.take } : {}),
  });
  return rows.map((row) => ({
    classId: row.document.classId,
    documentId: row.documentId,
    documentCreatedAt: row.document.createdAt,
    position: row.position,
    text: row.text,
  }));
}
