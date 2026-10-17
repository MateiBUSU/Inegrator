import { describe, expect, it } from "vitest";
import { isWellFormed } from "@app/shared";
import {
  HARD_MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  TARGET_MAX_CHUNK_CHARS,
  chunkText,
} from "./chunking";

const sentence = "Aceasta este o propoziție despre variabile și tipuri de date.";
const paragraph = (chars: number, label = "p") =>
  `${label}: ${sentence} `
    .repeat(Math.ceil(chars / 60))
    .slice(0, chars)
    .trim();

const squash = (value: string) => value.replace(/\s+/g, "");

describe("chunkText", () => {
  it("returns zero chunks for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n \t \r\n ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkText("O singură propoziție.")).toEqual(["O singură propoziție."]);
  });

  it("splits a long text into several chunks, none over 1000 characters", () => {
    const text = Array.from({ length: 40 }, (_, i) => paragraph(300, `par${i}`)).join("\n\n");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(HARD_MAX_CHUNK_CHARS);
    // Paragraph-based chunks stay in the 500-800 range, except possibly the last one.
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS - 1);
      expect(chunk.length).toBeLessThanOrEqual(TARGET_MAX_CHUNK_CHARS);
    }
  });

  it("loses no text (only whitespace at the break points)", () => {
    const text = Array.from({ length: 25 }, (_, i) => paragraph(420, `par${i}`)).join("\n\n");
    expect(squash(chunkText(text).join(" "))).toBe(squash(text));
  });

  it("breaks at a blank line between two paragraphs rather than mid-sentence", () => {
    const a = paragraph(600, "alpha");
    const b = paragraph(600, "beta");
    const chunks = chunkText(`${a}\n\n${b}`);
    expect(chunks).toEqual([a, b]);
  });

  it("starts a new chunk at a markdown heading once the current chunk is substantial", () => {
    const intro = paragraph(560, "intro");
    const next = paragraph(300, "next");
    const chunks = chunkText(`# Titlu\n\n${intro}\n\n## Secțiunea a doua\n\n${next}`);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.startsWith("# Titlu")).toBe(true);
    expect(chunks[1]?.startsWith("## Secțiunea a doua")).toBe(true);
  });

  it("does not leave a tiny chunk when a heading follows a very short paragraph", () => {
    const chunks = chunkText(`Scurt.\n\n## Titlu\n\n${paragraph(300)}`);
    expect(chunks).toHaveLength(1);
  });

  it("breaks an oversized paragraph at sentence ends", () => {
    const long = `${sentence} `.repeat(45).trim(); // ~2700 chars, no blank lines
    const chunks = chunkText(long);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(HARD_MAX_CHUNK_CHARS);
    for (const chunk of chunks) expect(chunk.endsWith(".")).toBe(true);
  });

  it("hard-cuts text with no break point at 1000 characters", () => {
    const text = "a".repeat(3500);
    const chunks = chunkText(text);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 1000, 500]);
    expect(chunks.join("")).toBe(text);
  });

  it("never splits a surrogate pair when hard-cutting", () => {
    const chunks = chunkText("😀".repeat(1200)); // 2400 UTF-16 code units, no whitespace
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(HARD_MAX_CHUNK_CHARS);
      expect(isWellFormed(chunk)).toBe(true);
    }
    expect(chunks.join("")).toBe("😀".repeat(1200));
  });

  it("normalizes CRLF line endings", () => {
    const chunks = chunkText(`Primul paragraf.\r\n\r\nAl doilea paragraf.`);
    expect(chunks).toEqual(["Primul paragraf.\n\nAl doilea paragraf."]);
  });

  it("handles a 200 KB document quickly in the worst shapes, always within limits", () => {
    const size = 200 * 1024;
    const shapes: Record<string, string> = {
      "no whitespace": "a".repeat(size),
      "tiny paragraphs": "x\n\n".repeat(Math.floor(size / 3)),
      "tiny headings": "# h\n".repeat(Math.floor(size / 4)),
      "one long sentence-less line": "palavra ".repeat(Math.floor(size / 8)),
      "sentences without breaks": `${sentence} `.repeat(Math.floor(size / 62)),
    };
    for (const [name, text] of Object.entries(shapes)) {
      const started = performance.now();
      const chunks = chunkText(text);
      const elapsed = performance.now() - started;

      expect(elapsed, `${name} took ${elapsed.toFixed(0)} ms`).toBeLessThan(2000);
      expect(chunks.length, name).toBeGreaterThan(0);
      expect(chunks.length, name).toBeLessThanOrEqual(Math.ceil(size / 400));
      for (const chunk of chunks) {
        expect(chunk.length, name).toBeLessThanOrEqual(HARD_MAX_CHUNK_CHARS);
        expect(chunk.length, name).toBeGreaterThan(0);
      }
      expect(squash(chunks.join("")), name).toBe(squash(text));
    }
  });

  it("is deterministic", () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(500, `p${i}`)).join("\n\n");
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});
