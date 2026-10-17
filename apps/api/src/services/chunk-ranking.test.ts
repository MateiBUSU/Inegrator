import { describe, expect, it } from "vitest";
import { rankChunks, tokenize, type RetrievableChunk } from "./chunk-ranking";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DOC1 = "d0000000-0000-4000-8000-000000000001";
const DOC2 = "d0000000-0000-4000-8000-000000000002";
const DOC3 = "d0000000-0000-4000-8000-000000000003";

const chunk = (
  classId: string,
  documentId: string,
  position: number,
  text: string,
  created = 1,
): RetrievableChunk => ({
  classId,
  documentId,
  position,
  text,
  documentCreatedAt: new Date(created * 1000),
});

describe("tokenize", () => {
  it("lowercases, strips punctuation and drops stopwords and one-letter tokens", () => {
    expect(tokenize("Ce este o VARIABILĂ, în C++?")).toEqual(["variabila"]);
    expect(tokenize("The loop, and the condition!")).toEqual(["loop", "and", "condition"]);
  });

  it("matches across diacritics, including cedilla and comma-below variants", () => {
    const forms = ["funcție", "functie", "FUNCŢIE", "funcţie"].map(tokenize);
    for (const tokens of forms) expect(tokens).toEqual(["functie"]);
    expect(tokenize("ș ş")).toEqual([]); // one-letter after stripping
    expect(tokenize("știință")).toEqual(tokenize("stiinta"));
  });

  it("keeps programming keywords and numbers", () => {
    expect(tokenize("for if while int x1 100")).toEqual(["for", "if", "while", "int", "x1", "100"]);
  });

  it("returns nothing for empty or all-stopword input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("și de la the of")).toEqual([]);
  });
});

describe("rankChunks", () => {
  it("returns only chunks of the requested class when two classes have overlapping content", () => {
    const overlapping = "Bucla while repetă instrucțiunile cât timp condiția este adevărată.";
    const chunks = [
      chunk(A, DOC1, 0, overlapping),
      chunk(B, DOC2, 0, overlapping),
      chunk(B, DOC3, 0, `${overlapping} Încă un paragraf despre bucla while.`),
    ];

    const forA = rankChunks(A, "bucla while condiția", chunks);
    expect(forA).toHaveLength(1);
    expect(forA[0]?.classId).toBe(A);
    expect(forA[0]?.documentId).toBe(DOC1);

    const forB = rankChunks(B, "bucla while condiția", chunks);
    expect(forB.every((c) => c.classId === B)).toBe(true);
    expect(forB).toHaveLength(2);
  });

  it("returns an empty list when no token overlaps", () => {
    const chunks = [chunk(A, DOC1, 0, "Variabile și tipuri de date.")];
    expect(rankChunks(A, "pointeri recursivitate", chunks)).toEqual([]);
  });

  it("returns an empty list for an empty or all-stopword query, or no chunks", () => {
    const chunks = [chunk(A, DOC1, 0, "Variabile și tipuri de date.")];
    expect(rankChunks(A, "", chunks)).toEqual([]);
    expect(rankChunks(A, "și de la", chunks)).toEqual([]);
    expect(rankChunks(A, "variabile", [])).toEqual([]);
    expect(rankChunks(A, "variabile", chunks, 0)).toEqual([]);
  });

  it("orders results by score descending", () => {
    const chunks = [
      chunk(A, DOC1, 0, "doar variabile aici"),
      chunk(A, DOC1, 1, "variabile tipuri și bucle for"),
      chunk(A, DOC1, 2, "variabile tipuri"),
      chunk(A, DOC1, 3, "nimic relevant"),
    ];
    const result = rankChunks(A, "variabile tipuri bucle", chunks);
    expect(result.map((c) => [c.position, c.score])).toEqual([
      [1, 3],
      [2, 2],
      [0, 1],
    ]);
  });

  it("scores distinct overlapping tokens, not repeated occurrences", () => {
    const chunks = [
      chunk(A, DOC1, 0, "bucla bucla bucla bucla bucla"),
      chunk(A, DOC1, 1, "bucla variabila"),
    ];
    const result = rankChunks(A, "bucla variabila", chunks);
    expect(result.map((c) => [c.position, c.score])).toEqual([
      [1, 2],
      [0, 1],
    ]);
  });

  it("breaks ties by document order, then position", () => {
    const chunks = [
      chunk(A, DOC2, 1, "variabile", 5),
      chunk(A, DOC1, 2, "variabile", 9),
      chunk(A, DOC2, 0, "variabile", 5),
      chunk(A, DOC3, 0, "variabile", 1),
    ];
    const result = rankChunks(A, "variabile", chunks);
    // doc3 (oldest), then doc2 (positions 0,1), then doc1 (newest)
    expect(result.map((c) => `${c.documentId.slice(-1)}:${c.position}`)).toEqual([
      "3:0",
      "2:0",
      "2:1",
      "1:2",
    ]);
  });

  it("is independent of the input order", () => {
    const chunks = [
      chunk(A, DOC1, 0, "bucla for"),
      chunk(A, DOC2, 0, "bucla while", 2),
      chunk(A, DOC1, 1, "bucla for while", 1),
    ];
    const forward = rankChunks(A, "bucla while", chunks);
    const backward = rankChunks(A, "bucla while", [...chunks].reverse());
    expect(backward).toEqual(forward);
  });

  it("applies the limit (default 5)", () => {
    const chunks = Array.from({ length: 12 }, (_, i) => chunk(A, DOC1, i, "variabile tipuri"));
    expect(rankChunks(A, "variabile", chunks)).toHaveLength(5);
    expect(rankChunks(A, "variabile", chunks, 3)).toHaveLength(3);
    expect(rankChunks(A, "variabile", chunks, 100)).toHaveLength(12);
  });

  it("handles odd limits: NaN, negative and zero give [], fractional truncates, Infinity returns all", () => {
    const chunks = Array.from({ length: 6 }, (_, i) => chunk(A, DOC1, i, "variabile tipuri"));
    expect(rankChunks(A, "variabile", chunks, Number.NaN)).toEqual([]);
    expect(rankChunks(A, "variabile", chunks, -3)).toEqual([]);
    expect(rankChunks(A, "variabile", chunks, 0)).toEqual([]);
    expect(rankChunks(A, "variabile", chunks, 2.7)).toHaveLength(2);
    expect(rankChunks(A, "variabile", chunks, Number.POSITIVE_INFINITY)).toHaveLength(6);
  });

  it("returns nothing for an undefined or empty class id, never everything", () => {
    const chunks = [chunk(A, DOC1, 0, "variabile tipuri")];
    expect(rankChunks(undefined as unknown as string, "variabile", chunks)).toEqual([]);
    expect(rankChunks("", "variabile", chunks)).toEqual([]);
  });

  it("matches regardless of diacritics and case", () => {
    const chunks = [chunk(A, DOC1, 0, "Funcția main este punctul de intrare.")];
    expect(rankChunks(A, "FUNCTIA MAIN", chunks)).toHaveLength(1);
    expect(rankChunks(A, "functie", chunks)).toHaveLength(0); // different word, no stemming
  });

  it("ignores chunks of another class even if the caller passes them in", () => {
    const chunks = [chunk(B, DOC1, 0, "variabile variabile tipuri")];
    expect(rankChunks(A, "variabile tipuri", chunks)).toEqual([]);
  });
});
