import {
  allQuestions,
  materialContentSchema,
  materialDefinitionSchema,
  type MaterialContent,
  type MaterialDefinition,
  type Question,
} from "@app/shared";
import type { MaterialRecord } from "../repositories/material-repository";

/** The part stored in materials.content (title and kind live in their own columns). */
export function contentOf(def: MaterialDefinition): MaterialContent {
  return {
    section: def.section,
    language: def.language,
    grade: def.grade,
    objectives: def.objectives,
    ...(def.lesson ? { lesson: def.lesson } : {}),
    ...(def.questions ? { questions: def.questions } : {}),
  };
}

/** Rebuilds and re-validates the full definition from a stored row. */
export function definitionOf(record: MaterialRecord): MaterialDefinition {
  const content = materialContentSchema.parse(record.content);
  return materialDefinitionSchema.parse({ title: record.title, kind: record.kind, ...content });
}

function mapQuestions(def: MaterialDefinition, fn: (q: Question) => Question): MaterialDefinition {
  return {
    ...def,
    ...(def.lesson
      ? { lesson: { ...def.lesson, checkQuestions: def.lesson.checkQuestions.map(fn) } }
      : {}),
    ...(def.questions ? { questions: def.questions.map(fn) } : {}),
  };
}

export function resetVerification(def: MaterialDefinition): MaterialDefinition {
  return mapQuestions(def, (q) => ({ ...q, verification: "unchecked" }));
}

export function setVerification(
  def: MaterialDefinition,
  questionIds: Set<string>,
  verification: Question["verification"],
): MaterialDefinition {
  return mapQuestions(def, (q) => (questionIds.has(q.id) ? { ...q, verification } : q));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

function withoutVerification(q: Question): string {
  const rest: Partial<Question> = { ...q };
  delete rest.verification;
  return canonical(rest);
}

/**
 * Verification is server-controlled: whatever a client sent is discarded. A question keeps its
 * stored status only if it is unchanged (same id, identical content); new or edited questions
 * go back to "unchecked", so an edited answer key can never ride on an old confirmation.
 */
export function reconcileVerification(
  existing: MaterialDefinition | null,
  incoming: MaterialDefinition,
): MaterialDefinition {
  const previous = new Map((existing ? allQuestions(existing) : []).map((q) => [q.id, q]));
  return mapQuestions(incoming, (q) => {
    const old = previous.get(q.id);
    const unchanged = old !== undefined && withoutVerification(old) === withoutVerification(q);
    return { ...q, verification: unchanged ? old.verification : "unchecked" };
  });
}
