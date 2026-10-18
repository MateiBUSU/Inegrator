/**
 * The Gemini API keys to use, in order: GEMINI_API_KEYS (comma-separated) when set, otherwise
 * the single GEMINI_API_KEY. Blanks and duplicates are dropped. Never log the result.
 */
export function resolveGeminiKeys(source: {
  GEMINI_API_KEYS?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
}): string[] {
  const listed = (source.GEMINI_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key !== "");
  const keys = listed.length > 0 ? listed : [source.GEMINI_API_KEY?.trim() ?? ""];
  return [...new Set(keys.filter((key) => key !== ""))];
}

/**
 * True for a quota / rate-limit error from the Gemini SDK: an ApiError whose HTTP status is 429
 * (RESOURCE_EXHAUSTED). Checked against a real error object: it has `name: "ApiError"` and a
 * numeric `status`. A 503 "high demand" is a different error and must NOT count: another key
 * does not help there.
 */
export function isQuotaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 429
  );
}
