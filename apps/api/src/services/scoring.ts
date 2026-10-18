import {
  allQuestions,
  REASONING_POINTS,
  type MaterialDefinition,
  type Question,
  type QuestionResult,
  type ReasoningVerdict,
  type SubmittedAnswer,
} from "@app/shared";

export interface ScoredAttempt {
  /** Points over the auto-scored questions: 1 per correct one, 0.5 per PARTIAL reasoning answer. */
  score: number;
  /** Number of auto-scored questions; programming questions are not counted. */
  maxScore: number;
  selfEvaluationCount: number;
  /** One entry per question, in material order. Contains the answer key: post-submission only. */
  results: QuestionResult[];
}

/** Lowercase, trim, collapse internal whitespace. */
export function normalizeShortAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Exact set equality: a partial selection or an extra option is wrong, there is no partial credit. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
}

/** AI verdicts of the reasoning answers, by question id (see attempt-service). */
export type ReasoningVerdicts = ReadonlyMap<string, ReasoningVerdict>;

const NO_ANSWER_FEEDBACK = "Nu ai trimis niciun răspuns la această întrebare.";

function gradeQuestion(
  question: Question,
  answer: SubmittedAnswer | undefined,
  verdicts: ReasoningVerdicts,
): QuestionResult {
  const base = {
    questionId: question.id,
    objectiveId: question.objectiveId,
    ...(question.explanation ? { explanation: question.explanation } : {}),
  };

  if (question.type === "mcq") {
    const selected = [...new Set(answer?.optionIds ?? [])];
    const correct = question.correct ?? [];
    return { ...base, type: "mcq", isCorrect: sameSet(selected, correct), selected, correct };
  }

  if (question.type === "short") {
    const text = answer?.text ?? "";
    const accepted = question.acceptedAnswers ?? [];
    const given = normalizeShortAnswer(text);
    return {
      ...base,
      type: "short",
      isCorrect: given !== "" && accepted.some((item) => normalizeShortAnswer(item) === given),
      text,
      acceptedAnswers: accepted,
    };
  }

  if (question.type === "reasoning") {
    // The reference answer (referenceSolution) is deliberately not part of the result, and the
    // teacher's explanation is left out too: it could restate it.
    const text = answer?.text ?? "";
    const given = verdicts.get(question.id);
    const verdict = given?.verdict ?? "GRESIT";
    return {
      questionId: question.id,
      objectiveId: question.objectiveId,
      type: "reasoning",
      text,
      verdict,
      points: REASONING_POINTS[verdict],
      feedback: given?.feedback ?? NO_ANSWER_FEEDBACK,
      ...(given?.explanation ? { reexplanation: given.explanation } : {}),
    };
  }

  return {
    ...base,
    type: "programming",
    evaluation: "self-evaluation",
    text: answer?.text ?? "",
    referenceSolution: question.referenceSolution ?? "",
    ...(question.rubric ? { rubric: question.rubric } : {}),
  };
}

/**
 * Pure and deterministic: the score depends only on the confirmed answer key in `material` and
 * on the submitted answers. A missing answer to an auto-scored question counts as wrong.
 */
export function scoreAttempt(
  material: Pick<MaterialDefinition, "lesson" | "questions">,
  answers: readonly SubmittedAnswer[],
  verdicts: ReasoningVerdicts = new Map(),
): ScoredAttempt {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const results = allQuestions(material).map((question) =>
    gradeQuestion(question, byQuestion.get(question.id), verdicts),
  );

  const scored = results.filter((result) => result.type !== "programming");
  const points = (result: QuestionResult): number =>
    result.type === "reasoning" ? result.points : "isCorrect" in result && result.isCorrect ? 1 : 0;
  return {
    score: scored.reduce((sum, result) => sum + points(result), 0),
    maxScore: scored.length,
    selfEvaluationCount: results.length - scored.length,
    results,
  };
}
