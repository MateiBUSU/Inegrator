import { listChunksForClass } from "../repositories/document-repository";
import { DEFAULT_RETRIEVAL_LIMIT, rankChunks, type ScoredChunk } from "./chunk-ranking";

/**
 * The best chunks from this class's documents for a query. No AI call.
 * Class scoping is enforced twice: the repository only loads this class's chunks, and
 * rankChunks ignores any chunk of another class.
 */
export async function retrieveChunks(
  classId: string,
  query: string,
  limit: number = DEFAULT_RETRIEVAL_LIMIT,
): Promise<ScoredChunk[]> {
  const chunks = await listChunksForClass(classId);
  return rankChunks(classId, query, chunks, limit);
}
