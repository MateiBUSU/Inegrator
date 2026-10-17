// Splits a document into chunks for retrieval. Pure and deterministic.
//
// Targets 500-800 characters per chunk, preferring blank lines and markdown headings as break
// points, then sentence ends, then whitespace. No chunk ever exceeds HARD_MAX_CHARS.

export const MIN_CHUNK_CHARS = 500;
export const TARGET_MAX_CHUNK_CHARS = 800;
export const HARD_MAX_CHUNK_CHARS = 1000;

const HEADING = /^#{1,6}\s/;

function isHeading(block: string): boolean {
  return HEADING.test(block);
}

/** Paragraph blocks: split on blank lines, and start a new block at every markdown heading. */
function toBlocks(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/)
    .flatMap((paragraph) => paragraph.split(/\n(?=#{1,6}\s)/))
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/** Last index in `text` (at or after `from`) just after a sentence end, or -1. */
function lastSentenceEnd(text: string, from: number): number {
  let found = -1;
  for (const match of text.matchAll(/[.!?…]["')\]]?(?=\s)/g)) {
    const end = match.index + match[0].length;
    if (end >= from) found = end;
  }
  return found;
}

function lastWhitespace(text: string, from: number): number {
  for (let i = text.length - 1; i >= from; i--) {
    if (/\s/.test(text.charAt(i))) return i;
  }
  return -1;
}

/** Breaks one oversized block into pieces of at most HARD_MAX_CHARS. */
function splitLongBlock(block: string): string[] {
  const pieces: string[] = [];
  let rest = block;
  while (rest.length > HARD_MAX_CHUNK_CHARS) {
    const window = rest.slice(0, TARGET_MAX_CHUNK_CHARS);
    let cut = lastSentenceEnd(window, MIN_CHUNK_CHARS);
    if (cut < 0) cut = lastWhitespace(rest.slice(0, HARD_MAX_CHUNK_CHARS), MIN_CHUNK_CHARS);
    if (cut < 0) {
      // No good break point: hard cut, without splitting a surrogate pair.
      cut = HARD_MAX_CHUNK_CHARS;
      const before = rest.charCodeAt(cut - 1);
      if (before >= 0xd800 && before <= 0xdbff) cut -= 1;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces.filter((piece) => piece.length > 0);
}

/** Empty or whitespace-only input yields no chunks. */
export function chunkText(input: string): string[] {
  const text = input.replace(/\r\n?/g, "\n").trim();
  if (text === "") return [];

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current !== "") chunks.push(current);
    current = "";
  };

  for (const block of toBlocks(text)) {
    if (block.length > HARD_MAX_CHUNK_CHARS) {
      flush();
      const pieces = splitLongBlock(block);
      // Keep the (usually short) last piece open so the next block can join it.
      chunks.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? "";
      continue;
    }

    const joined = current === "" ? block.length : current.length + 2 + block.length;
    if (current === "") {
      current = block;
    } else if (isHeading(block) && current.length >= MIN_CHUNK_CHARS) {
      flush(); // a new section starts a new chunk once the current one is substantial
      current = block;
    } else if (joined <= TARGET_MAX_CHUNK_CHARS) {
      current = `${current}\n\n${block}`;
    } else if (current.length < MIN_CHUNK_CHARS && joined <= HARD_MAX_CHUNK_CHARS) {
      current = `${current}\n\n${block}`; // avoid leaving a tiny chunk behind
    } else {
      flush();
      current = block;
    }
  }
  flush();
  return chunks;
}
