import { beforeEach, describe, expect, it, vi } from "vitest";
import { listChunksForClass } from "./document-repository";

// Prisma is mocked only to pin the exact query arguments: the class scoping of retrieval lives
// in this `where` clause, and a regression such as `classId: undefined` would make Prisma match
// every row. The real query is also exercised against Postgres in the manual end-to-end run.
const prismaMock = vi.hoisted(() => ({
  documentChunk: { findMany: vi.fn() },
}));

vi.mock("./prisma-client", () => ({ prisma: prismaMock }));

const CLASS_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  prismaMock.documentChunk.findMany.mockReset();
  prismaMock.documentChunk.findMany.mockResolvedValue([]);
});

describe("listChunksForClass", () => {
  it("queries only chunks whose document belongs to the given class", async () => {
    await listChunksForClass(CLASS_ID);

    expect(prismaMock.documentChunk.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.documentChunk.findMany.mock.calls[0]?.[0] as {
      where: unknown;
      select: Record<string, unknown>;
    };
    expect(args.where).toEqual({ document: { classId: CLASS_ID } });
    // The document's own classId is selected so rankChunks can double-check it.
    expect(args.select.document).toEqual({ select: { classId: true, createdAt: true } });
  });

  it("maps rows to chunks carrying the document's classId and creation time", async () => {
    const createdAt = new Date(5000);
    prismaMock.documentChunk.findMany.mockResolvedValue([
      {
        documentId: "d1",
        position: 2,
        text: "Bucla while",
        document: { classId: CLASS_ID, createdAt },
      },
    ]);

    expect(await listChunksForClass(CLASS_ID)).toEqual([
      {
        classId: CLASS_ID,
        documentId: "d1",
        documentCreatedAt: createdAt,
        position: 2,
        text: "Bucla while",
      },
    ]);
  });
});
