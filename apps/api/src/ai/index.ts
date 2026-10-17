import { env } from "../config/env";
import { createAiEngine, type AiEngine } from "./engine";
import type { ContentGenerator } from "./generator";
import { MockGenerator } from "./mock-generator";

import { AiUnavailableError } from "./errors";

// Public entry point of the AI module: services import from "../ai" only.
export { AiUnavailableError };
export type { AiEngine } from "./engine";
export type { ContentGenerator, GenerationKind, Objective } from "./generator";

let override: ContentGenerator | null = null;
let cached: { key: string; engine: AiEngine } | null = null;

/** Test seam: force a provider (or pass null to go back to the configured one). */
export function setAiProviderForTesting(provider: ContentGenerator | null): void {
  override = provider;
  cached = null;
}

async function configuredProvider(): Promise<ContentGenerator> {
  if (env.AI_PROVIDER === "gemini") {
    // Loaded lazily so the SDK is never imported unless Gemini is explicitly enabled.
    const { GeminiGenerator } = await import("./gemini-generator");
    // env validation guarantees the key is present when AI_PROVIDER=gemini.
    return new GeminiGenerator(env.GEMINI_API_KEY ?? "", env.GEMINI_MODEL);
  }
  return new MockGenerator();
}

/**
 * The validated AI engine for the configured provider (mock unless AI_PROVIDER=gemini).
 * If the provider cannot even be set up (e.g. the SDK fails to load), that is reported as the
 * typed AI_UNAVAILABLE error, never as a raw 500.
 */
export async function getAiEngine(): Promise<AiEngine> {
  if (override) return createAiEngine(override);
  const key = env.AI_PROVIDER;
  if (cached?.key !== key) {
    try {
      cached = { key, engine: createAiEngine(await configuredProvider()) };
    } catch (err) {
      console.error(
        `AI provider "${key}" could not be initialised: ${err instanceof Error ? err.name : "unknown error"}`,
      );
      throw new AiUnavailableError();
    }
  }
  return cached.engine;
}
