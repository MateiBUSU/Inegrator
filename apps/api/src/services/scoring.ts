import {
  allQuestions,
  type MaterialDefinition,
  type Question,
  type QuestionResult,
  type SubmittedAnswer,
} from "@app/shared";

export interface ScoredAttempt {
  /** Number of auto-scored questions answered correctly (1 point each). */
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

function gradeQuestion(question: Question, answer: SubmittedAnswer | undefined): QuestionResult {
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

  return {
    ...base,
    type: "programming",
    evaluation: "self-evaluation",
    referenceSolution: question.referenceSolution ?? "",
    ...(question.rubric ? { rubric: question.rubric } : {}),
  };
}

/**
 * Pure and deterministic: the score depends only on the confirmed answer key in `material` and
 * on the submitted answers. A missing answer to an auto-scored question counts as wrong.
 */
export function scoreAttempt(
  material: MaterialDefinition,
  answers: readonly SubmittedAnswer[],
): ScoredAttempt {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const results = allQuestions(material).map((question) =>
    gradeQuestion(question, byQuestion.get(question.id)),
  );

  const scored = results.filter((result) => result.type !== "programming");
  return {
    score: scored.filter((result) => "isCorrect" in result && result.isCorrect).length,
    maxScore: scored.length,
    selfEvaluationCount: results.length - scored.length,
    results,
  };
}
