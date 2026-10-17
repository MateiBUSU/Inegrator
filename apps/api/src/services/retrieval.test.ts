import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievableChunk } from "./chunk-ranking";
import { retrieveChunks } from "./retrieval";

// The repository is a fake (no database). `leaky` simulates a buggy repository that ignores its
// classId argument and returns every class's chunks.
const state = vi.hoisted(() => ({
  chunks: [] as RetrievableChunk[],
  leaky: false,
  calls: [] as string[],
}));

vi.mock("../repositories/document-repository", () => ({
  listChunksForClass: async (classId: string) => {
    state.calls.push(classId);
    return state.leaky ? state.chunks : state.chunks.filter((c) => c.classId === classId);
  },
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const text = "Bucla while repetă instrucțiunile cât timp condiția este adevărată.";
const chunk = (classId: string, documentId: string, position: number, body: string) => ({
  classId,
  documentId,
  position,
  text: body,
  documentCreatedAt: new Date(1000),
});

beforeEach(() => {
  state.chunks = [
    chunk(A, "d0000000-0000-4000-8000-00000000000a", 0, text),
    chunk(B, "d0000000-0000-4000-8000-00000000000b", 0, text),
    chunk(B, "d0000000-0000-4000-8000-00000000000c", 0, `${text} Mai multe despre bucla while.`),
  ];
  state.leaky = false;
  state.calls = [];
});

describe("retrieveChunks", () => {
  it("asks the repository for this class only and returns only its chunks", async () => {
    const result = await retrieveChunks(A, "bucla while condiția");
    expect(state.calls).toEqual([A]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classId: A, score: 3 });
  });

  it("does not leak another class's chunks even if the repository returns them", async () => {
    state.leaky = true;
    const result = await retrieveChunks(A, "bucla while condiția");
    expect(result.every((c) => c.classId === A)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("returns an empty list (not an error) when nothing matches", async () => {
    expect(await retrieveChunks(A, "pointeri recursivitate")).toEqual([]);
    expect(await retrieveChunks("33333333-3333-4333-8333-333333333333", "bucla while")).toEqual([]);
  });

  it("defaults to 5 results and honours a custom limit", async () => {
    state.chunks = Array.from({ length: 9 }, (_, i) =>
      chunk(A, "d0000000-0000-4000-8000-00000000000a", i, "variabile tipuri"),
    );
    expect(await retrieveChunks(A, "variabile")).toHaveLength(5);
    expect(await retrieveChunks(A, "variabile", 2)).toHaveLength(2);
  });
});
