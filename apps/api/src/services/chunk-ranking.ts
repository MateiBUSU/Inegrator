import { STOPWORDS } from "../config/stopwords";

// Pure ranking logic for retrieval: no database, no AI.

export const DEFAULT_RETRIEVAL_LIMIT = 5;

export interface RetrievableChunk {
  classId: string;
  documentId: string;
  documentCreatedAt: Date;
  position: number;
  text: string;
}

export interface ScoredChunk extends RetrievableChunk {
  score: number;
}

/**
 * Lowercase, strip diacritics and punctuation, drop stopwords and one-character tokens.
 * Diacritics are stripped (NFD, then combining marks) so "funcție", "functie" and the
 * cedilla/comma-below variants of ș and ț all match each other.
 */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/**
 * The top chunks of `classId` by token overlap with the query.
 *
 * Score = number of distinct query tokens that occur in the chunk. Chunks with score 0 are
 * dropped. Ties are broken by document order (creation time, then id) and then position, so the
 * result is fully deterministic. Chunks whose classId differs from the requested one are ignored
 * even if the caller passes them in: class scoping does not rely on the caller alone.
 */
export function rankChunks(
  classId: string,
  query: string,
  chunks: readonly RetrievableChunk[],
  limit: number = DEFAULT_RETRIEVAL_LIMIT,
): ScoredChunk[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || limit <= 0) return [];

  const scored: ScoredChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.classId !== classId) continue;
    const chunkTokens = new Set(tokenize(chunk.text));
    let score = 0;
    for (const token of queryTokens) if (chunkTokens.has(token)) score += 1;
    if (score > 0) scored.push({ ...chunk, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.documentCreatedAt.getTime() - b.documentCreatedAt.getTime() ||
      (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0) ||
      a.position - b.position,
  );
  return scored.slice(0, limit);
}
