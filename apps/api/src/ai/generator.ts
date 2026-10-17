import type { Policy, StudentQuestion } from "@app/shared";

// The only way the rest of the app talks to an AI provider. Services depend on this interface
// (through AiEngine), never on a provider SDK. Inputs deliberately contain only topic, level,
// objectives, teacher-provided source text and a neutral policy: no student identity, ever.

export type AiProviderName = "mock" | "gemini";
export type GenerationKind = "test" | "problem" | "exercise";

export interface Objective {
  id: string;
  text: string;
}

export interface GenerationContext {
  subjectTitle: string;
  chapterTitle: string;
  objectives: Objective[];
  /** Chunks of the teacher's own documents; empty when no teacher source is available. */
  sourceChunks: string[];
  styleNotes: string | null;
  policy: Policy;
  language?: "cpp" | "python";
  /**
   * "personal": a student's own topic. The objective text is written by the student, there is no
   * teacher source, and the safety rules for security topics apply. Default "class".
   */
  mode?: "class" | "personal";
}

export type LessonInput = GenerationContext;

export interface QuizInput extends GenerationContext {
  count: number;
  kind?: GenerationKind;
}

export interface StyleNotesInput {
  sampleText: string;
}

export interface SolveInput {
  /** Questions as students see them: no answer keys. */
  questions: StudentQuestion[];
}

export interface TutorTurn {
  role: "user" | "tutor";
  content: string;
}

/** Topic text, the question, recent turns and the policy: no student identity, ever. */
export interface TutorInput {
  topicGoal: string;
  question: string;
  /** Oldest first, at most the last ~10 messages. */
  recentMessages: TutorTurn[];
  policy: Policy;
}

/**
 * Raw provider interface. Every method returns `unknown`: nothing a provider returns is trusted
 * until the engine has validated it (see engine.ts).
 */
export interface ContentGenerator {
  readonly provider: AiProviderName;
  generateLesson(input: LessonInput): Promise<unknown>;
  generateQuiz(input: QuizInput): Promise<unknown>;
  extractStyleNotes(input: StyleNotesInput): Promise<unknown>;
  solveQuestions(input: SolveInput): Promise<unknown>;
  tutorReply(input: TutorInput): Promise<unknown>;
}
