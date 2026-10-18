import { GoogleGenAI } from "@google/genai";
import { isQuotaError } from "./gemini-keys";
import type {
  ContentGenerator,
  LessonInput,
  PracticeDiagnosisInput,
  PracticeExerciseInput,
  QuizInput,
  ReasoningGradeInput,
  SolveInput,
  StyleNotesInput,
  TutorInput,
} from "./generator";
import {
  buildLessonPrompt,
  buildPracticeDiagnosisPrompt,
  buildPracticeExercisePrompt,
  buildQuizPrompt,
  buildReasoningGradePrompt,
  buildSolvePrompt,
  buildStyleNotesPrompt,
  buildTutorPrompt,
  type Prompt,
} from "./prompts";

// Gemini provider. STUB: wired behind AI_PROVIDER=gemini + GEMINI_API_KEY, never the default,
// and not exercised by the automated tests (no live call has been made with it). It only builds
// prompts (which contain no student data) and asks for JSON; the engine validates the result.
//
// Client setup follows the official @google/genai SDK: `new GoogleGenAI({ apiKey })` and
// `ai.models.generateContent({ model, contents, config })` with systemInstruction,
// responseMimeType, abortSignal and httpOptions.timeout (checked against the installed v2 types).

export const GEMINI_TIMEOUT_MS = 90_000;

// How long a key that hit its quota is skipped when there are other keys to use. Per-minute
// limits recover on their own; a daily limit costs one cheap failed call per window.
export const KEY_COOLDOWN_MS = 60_000;

export class GeminiGenerator implements ContentGenerator {
  readonly provider = "gemini" as const;
  private readonly clients: GoogleGenAI[];
  /** Index of the key in use; moves on only after a quota error (see callJson). */
  private active = 0;
  private readonly exhaustedUntil: number[];

  constructor(
    apiKeys: string | readonly string[],
    private readonly model: string,
  ) {
    const keys = typeof apiKeys === "string" ? [apiKeys] : apiKeys;
    this.clients = keys.map((apiKey) => new GoogleGenAI({ apiKey }));
    this.exhaustedUntil = keys.map(() => 0);
  }

  /**
   * One request, with key rotation on quota errors only. With several keys, a 429 marks the
   * current key as exhausted for a while and the SAME request is sent with the next usable key;
   * other errors (timeouts, 503 "high demand", bad output) are thrown as they are, so the
   * engine's retry-once-with-the-same-key behavior is unchanged. If every key is exhausted the
   * quota error is thrown (the engine turns it into AI_UNAVAILABLE): bounded, no loop. With a
   * single key nothing is tracked and the behavior is exactly the old one.
   */
  private async callJson(prompt: Prompt): Promise<unknown> {
    const count = this.clients.length;
    for (let tried = 0; ; tried++) {
      try {
        return await this.callWith(this.clients[this.active] as GoogleGenAI, prompt);
      } catch (error) {
        if (count === 1 || !isQuotaError(error)) throw error;
        this.exhaustedUntil[this.active] = Date.now() + KEY_COOLDOWN_MS;
        const next = this.nextUsableKey();
        if (next === null || tried + 1 >= count) throw error;
        console.error(
          `Gemini key ${this.active + 1} of ${count} hit its quota: switched to key ${next + 1}`,
        );
        this.active = next;
      }
    }
  }

  private nextUsableKey(): number | null {
    const now = Date.now();
    for (let step = 1; step < this.clients.length; step++) {
      const index = (this.active + step) % this.clients.length;
      if ((this.exhaustedUntil[index] ?? 0) <= now) return index;
    }
    return null;
  }

  private async callWith(client: GoogleGenAI, prompt: Prompt): Promise<unknown> {
    // Two layers: the SDK's own request timeout and an abort signal, so a hung call cannot
    // outlive GEMINI_TIMEOUT_MS.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: prompt.user,
        config: {
          systemInstruction: prompt.system,
          responseMimeType: "application/json",
          temperature: 0.4,
          abortSignal: controller.signal,
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
        },
      });
      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  generateLesson(input: LessonInput): Promise<unknown> {
    return this.callJson(buildLessonPrompt(input));
  }

  generateQuiz(input: QuizInput): Promise<unknown> {
    return this.callJson(buildQuizPrompt(input));
  }

  extractStyleNotes(input: StyleNotesInput): Promise<unknown> {
    return this.callJson(buildStyleNotesPrompt(input));
  }

  solveQuestions(input: SolveInput): Promise<unknown> {
    return this.callJson(buildSolvePrompt(input));
  }

  tutorReply(input: TutorInput): Promise<unknown> {
    return this.callJson(buildTutorPrompt(input));
  }

  generatePracticeExercise(input: PracticeExerciseInput): Promise<unknown> {
    return this.callJson(buildPracticeExercisePrompt(input));
  }

  diagnosePracticeAnswer(input: PracticeDiagnosisInput): Promise<unknown> {
    return this.callJson(buildPracticeDiagnosisPrompt(input));
  }

  gradeReasoningAnswer(input: ReasoningGradeInput): Promise<unknown> {
    return this.callJson(buildReasoningGradePrompt(input));
  }
}
