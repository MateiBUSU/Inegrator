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

/** A material the student has no progress entry for is "not started". */
export type StudentProgressState = "not_started" | "started" | "completed";

export const PROGRESS_LABELS: Record<StudentProgressState, string> = {
  not_started: "Nu a început",
  started: "În desfășurare",
  completed: "Încheiat",
};

// Personal learning space: the adaptive teaching policy in plain Romanian.
const EXPLANATION_LEVEL_LABELS = { basic: "simplu", standard: "standard", advanced: "avansat" };
const SCAFFOLDING_LABELS = { low: "scăzut", medium: "mediu", high: "ridicat" };

/** "Nivel explicații: standard · Exemplu înainte de teorie: da · Sprijin: mediu · Indicii: da" */
export function policySummary(policy: {
  explanationLevel: keyof typeof EXPLANATION_LEVEL_LABELS;
  exampleFirst: boolean;
  scaffolding: keyof typeof SCAFFOLDING_LABELS;
  hintsEnabled: boolean;
}): string {
  return [
    `Nivel explicații: ${EXPLANATION_LEVEL_LABELS[policy.explanationLevel]}`,
    `Exemplu înainte de teorie: ${policy.exampleFirst ? "da" : "nu"}`,
    `Sprijin: ${SCAFFOLDING_LABELS[policy.scaffolding]}`,
    `Indicii: ${policy.hintsEnabled ? "da" : "nu"}`,
  ].join(" · ");
}

// Adaptive practice on class objectives.
export const OBJECTIVE_STATUS_LABELS = {
  not_started: "Neînceput",
  struggling: "În lucru",
  mastered: "Stăpânit",
} as const;

export const STRATEGY_LABELS = {
  ANALOGIE: "Analogie",
  PAS_CU_PAS: "Pas cu pas",
  EXEMPLU_LUCRAT: "Exemplu lucrat",
  EXPLICATIE_VIZUALA: "Explicație vizuală",
  PARCURGERE_COD: "Parcurgere de cod",
  INTREBARE_SOCRATICA: "Întrebări ghidate",
} as const;
