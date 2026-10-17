import {
  generatedLessonSchema,
  generatedQuizSchema,
  solvedQuestionsSchema,
  styleNotesSuggestionSchema,
  type GeneratedLesson,
  type GeneratedQuiz,
  type Question,
  type SolvedQuestions,
  type StyleNotesSuggestion,
} from "@app/shared";
import { AiUnavailableError } from "./errors";
import type {
  AiProviderName,
  ContentGenerator,
  LessonInput,
  QuizInput,
  SolveInput,
  StyleNotesInput,
} from "./generator";

/**
 * What the rest of the app uses: the same four operations as a provider, but every result is
 * validated with the shared zod schemas first. Nothing unvalidated leaves this module.
 */
export interface AiEngine {
  readonly provider: AiProviderName;
  generateLesson(input: LessonInput): Promise<GeneratedLesson>;
  generateQuiz(input: QuizInput): Promise<GeneratedQuiz>;
  extractStyleNotes(input: StyleNotesInput): Promise<StyleNotesSuggestion>;
  solveQuestions(input: SolveInput): Promise<SolvedQuestions>;
}

const MAX_ATTEMPTS = 2; // the first call plus exactly one retry with the same input

/**
 * Calls the provider, validates the result, and on failure (invalid output or a provider error
 * such as a timeout) retries exactly once with the same input. A second failure throws
 * AiUnavailableError. Raw provider output is never logged or put in an error.
 */
async function validatedCall<T>(
  provider: AiProviderName,
  call: () => Promise<unknown>,
  validate: (raw: unknown) => T,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return validate(await call());
    } catch (err) {
      console.error(
        `AI provider "${provider}" failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err instanceof Error ? err.name : "unknown error"}`,
      );
    }
  }
  throw new AiUnavailableError();
}

/** A provider can never confirm an answer key: every question starts unchecked. */
function uncheckedAll(questions: Question[]): Question[] {
  return questions.map((q) => ({ ...q, verification: "unchecked" }));
}

function assertQuestionsMatch(questions: Question[], objectiveIds: Set<string>): void {
  const ids = new Set<string>();
  for (const q of questions) {
    if (!objectiveIds.has(q.objectiveId))
      throw new Error("question references an unknown objective");
    if (ids.has(q.id)) throw new Error("duplicate question id");
    ids.add(q.id);
  }
}

export function createAiEngine(provider: ContentGenerator): AiEngine {
  return {
    provider: provider.provider,

    generateLesson: (input) =>
      validatedCall(
        provider.provider,
        () => provider.generateLesson(input),
        (raw) => {
          const parsed = generatedLessonSchema.parse(raw);
          assertQuestionsMatch(
            parsed.lesson.checkQuestions,
            new Set(input.objectives.map((o) => o.id)),
          );
          return {
            lesson: {
              ...parsed.lesson,
              checkQuestions: uncheckedAll(parsed.lesson.checkQuestions),
            },
          };
        },
      ),

    generateQuiz: (input) =>
      validatedCall(
        provider.provider,
        () => provider.generateQuiz(input),
        (raw) => {
          const parsed = generatedQuizSchema.parse(raw);
          const questions = parsed.questions.slice(0, input.count);
          assertQuestionsMatch(questions, new Set(input.objectives.map((o) => o.id)));
          return { questions: uncheckedAll(questions) };
        },
      ),

    extractStyleNotes: (input) =>
      validatedCall(
        provider.provider,
        () => provider.extractStyleNotes(input),
        (raw) => styleNotesSuggestionSchema.parse(raw),
      ),

    solveQuestions: (input) =>
      validatedCall(
        provider.provider,
        () => provider.solveQuestions(input),
        (raw) => {
          const parsed = solvedQuestionsSchema.parse(raw);
          const known = new Set(input.questions.map((q) => q.id));
          if (parsed.answers.some((a) => !known.has(a.questionId))) {
            throw new Error("answer for an unknown question");
          }
          return parsed;
        },
      ),
  };
}
