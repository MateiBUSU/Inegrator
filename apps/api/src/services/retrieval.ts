import { listChunksForClass } from "../repositories/document-repository";
import { DEFAULT_RETRIEVAL_LIMIT, rankChunks, type ScoredChunk } from "./chunk-ranking";

/**
 * The best chunks from this class's documents for a query. No AI call.
 * Class scoping is enforced twice: the repository only loads this class's chunks, and
 * rankChunks ignores any chunk of another class. `documentIds` narrows the search further to
 * specific documents of the class (callers must have checked those ids belong to the class).
 */
export async function retrieveChunks(
  classId: string,
  query: string,
  limit: number = DEFAULT_RETRIEVAL_LIMIT,
  documentIds?: readonly string[],
): Promise<ScoredChunk[]> {
  const all = await listChunksForClass(classId);
  const chunks = documentIds ? all.filter((chunk) => documentIds.includes(chunk.documentId)) : all;
  return rankChunks(classId, query, chunks, limit);
}
