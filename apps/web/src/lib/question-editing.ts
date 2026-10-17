import type { Question } from "@app/shared";

// Pure helpers for editing a question in the draft editor. They never mutate their input.

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
const OPTION_IDS = "abcdefghij".split("");

/** The next free option id: a, b, c, ... */
export function nextOptionId(used: readonly string[]): string {
  return OPTION_IDS.find((id) => !used.includes(id)) ?? `o${used.length + 1}`;
}

export function addOption(question: Question): Question {
  const options = question.options ?? [];
  if (options.length >= MAX_OPTIONS) return question;
  const id = nextOptionId(options.map((option) => option.id));
  return { ...question, options: [...options, { id, text: "" }] };
}

/** Removes an option (and it from the correct answers). Keeps at least MIN_OPTIONS. */
export function removeOption(question: Question, optionId: string): Question {
  const options = question.options ?? [];
  if (options.length <= MIN_OPTIONS) return question;
  return {
    ...question,
    options: options.filter((option) => option.id !== optionId),
    correct: (question.correct ?? []).filter((id) => id !== optionId),
  };
}

export function setOptionText(question: Question, optionId: string, text: string): Question {
  return {
    ...question,
    options: (question.options ?? []).map((option) =>
      option.id === optionId ? { ...option, text } : option,
    ),
  };
}

export function toggleCorrect(question: Question, optionId: string): Question {
  const correct = question.correct ?? [];
  return {
    ...question,
    correct: correct.includes(optionId)
      ? correct.filter((id) => id !== optionId)
      : [...correct, optionId],
  };
}

export function acceptedAnswersToText(answers: readonly string[] | undefined): string {
  return (answers ?? []).join("\n");
}

/** One accepted answer per line; blank lines are ignored. */
export function textToAcceptedAnswers(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
