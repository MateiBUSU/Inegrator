import type { materialKindSchema, materialStatusSchema, questionTypeSchema } from "@app/shared";
import type { z } from "zod";

export type MaterialKind = z.infer<typeof materialKindSchema>;
export type MaterialStatusValue = z.infer<typeof materialStatusSchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;

// Romanian display names for the API's enum values.

export const KIND_LABELS: Record<MaterialKind, string> = {
  lesson: "Lecție",
  test: "Test",
  problem: "Probleme",
  exercise: "Exerciții",
};

export const STATUS_LABELS: Record<MaterialStatusValue, string> = {
  draft: "Ciornă",
  published: "Publicat",
  archived: "Arhivat",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Alegere multiplă",
  short: "Răspuns scurt",
  programming: "Programare",
};

export const LANGUAGE_LABELS = { cpp: "C++", python: "Python" } as const;
export const SECTION_LABELS = { programa: "Programă", bac: "Bacalaureat" } as const;

const ROMAN: Record<number, string> = { 9: "IX", 10: "X", 11: "XI", 12: "XII" };

/** "clasa a IX-a" for 9, and so on. */
export function gradeLabel(grade: number): string {
  return `clasa a ${ROMAN[grade] ?? grade}-a`;
}
