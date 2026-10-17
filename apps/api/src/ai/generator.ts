import type { ExplanationStrategy, Policy, Question, StudentQuestion } from "@app/shared";

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

interface PracticeContext {
  subjectTitle: string;
  chapterTitle: string;
  objective: Objective;
  language?: "cpp" | "python";
  policy: Policy;
}

/** One exercise for one objective. Topic and objective text only: no student identity. */
export interface PracticeExerciseInput extends PracticeContext {
  /** The strategy of the explanation the student last saw; null for the very first exercise. */
  strategy: ExplanationStrategy | null;
  /** That explanation, when there is one, so the exercise follows what was just taught. */
  explanation: string | null;
}

/** A wrong answer to diagnose. `question` is the full question WITH its key (never sent to a client). */
export interface PracticeDiagnosisInput extends PracticeContext {
  question: Question;
  submittedAnswer: string;
  /** The strategy the new explanation must use. */
  strategy: ExplanationStrategy;
  /** Strategies already used on this objective, oldest first. */
  previousStrategies: ExplanationStrategy[];
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
  generatePracticeExercise(input: PracticeExerciseInput): Promise<unknown>;
  diagnosePracticeAnswer(input: PracticeDiagnosisInput): Promise<unknown>;
}
