import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma-client";

// Personal materials: scope = 'personal', owned by one student, tied to one topic. Every query
// here names the scope AND the owner, and the class-side queries in material-repository name
// scope = 'class', so the two sets can never mix.
//
// Status: personal materials keep the database default "draft" and are never published, since
// there is no teacher review step. The status is meaningless for them and nothing reads it. It
// also means they can never match the "published + assigned" class student queries.

export interface PersonalMaterialRecord {
  id: string;
  ownerId: string;
  topicId: string;
  kind: "lesson" | "test" | "problem" | "exercise";
  title: string;
  content: unknown;
  createdAt: Date;
}

const select = {
  id: true,
  ownerId: true,
  topicId: true,
  kind: true,
  title: true,
  content: true,
  createdAt: true,
} as const;

type Row = Omit<PersonalMaterialRecord, "topicId"> & { topicId: string | null };

// topic_id is nullable in the table, but a personal material always has one (cascade on delete).
function withTopic(row: Row | null): PersonalMaterialRecord | null {
  return row && row.topicId !== null ? { ...row, topicId: row.topicId } : null;
}

export async function createPersonalMaterial(data: {
  ownerId: string;
  topicId: string;
  kind: PersonalMaterialRecord["kind"];
  title: string;
  content: unknown;
}): Promise<PersonalMaterialRecord> {
  const row = await prisma.material.create({
    data: {
      ownerId: data.ownerId,
      scope: "personal",
      source: "ai",
      kind: data.kind,
      title: data.title,
      topicId: data.topicId,
      content: data.content as Prisma.InputJsonValue,
    },
    select,
  });
  const record = withTopic(row);
  if (!record) throw new Error("personal material without a topic");
  return record;
}

export async function listPersonalMaterials(
  ownerId: string,
  topicId: string,
): Promise<PersonalMaterialRecord[]> {
  const rows = await prisma.material.findMany({
    where: { scope: "personal", ownerId, topicId },
    orderBy: { createdAt: "desc" },
    select,
  });
  return rows.flatMap((row) => withTopic(row) ?? []);
}

export async function findPersonalMaterial(
  ownerId: string,
  topicId: string,
  materialId: string,
): Promise<PersonalMaterialRecord | null> {
  const row = await prisma.material.findFirst({
    where: { id: materialId, scope: "personal", ownerId, topicId },
    select,
  });
  return withTopic(row);
}
