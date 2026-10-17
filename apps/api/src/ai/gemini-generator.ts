import { GoogleGenAI } from "@google/genai";
import type {
  ContentGenerator,
  LessonInput,
  QuizInput,
  SolveInput,
  StyleNotesInput,
} from "./generator";
import {
  buildLessonPrompt,
  buildQuizPrompt,
  buildSolvePrompt,
  buildStyleNotesPrompt,
  type Prompt,
} from "./prompts";

// Gemini provider. STUB: wired behind AI_PROVIDER=gemini + GEMINI_API_KEY, never the default,
// and not exercised by the automated tests (no live call has been made with it). It only builds
// prompts (which contain no student data) and asks for JSON; the engine validates the result.
//
// Client setup follows the official @google/genai SDK: `new GoogleGenAI({ apiKey })` and
// `ai.models.generateContent({ model, contents, config })` with systemInstruction,
// responseMimeType, abortSignal and httpOptions.timeout (checked against the installed v2 types).

export const GEMINI_TIMEOUT_MS = 15_000;

export class GeminiGenerator implements ContentGenerator {
  readonly provider = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async callJson(prompt: Prompt): Promise<unknown> {
    // Two layers: the SDK's own request timeout and an abort signal, so a hung call cannot
    // outlive GEMINI_TIMEOUT_MS.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await this.client.models.generateContent({
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
}
