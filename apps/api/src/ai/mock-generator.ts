import { EXPLANATION_STRATEGIES } from "@app/shared";
import type {
  ContentGenerator,
  LessonInput,
  Objective,
  PracticeDiagnosisInput,
  PracticeExerciseInput,
  QuizInput,
  SolveInput,
  StyleNotesInput,
  TutorInput,
} from "./generator";

// Deterministic provider for development, demos and tests: no network, no randomness, no clock.
// The same input always yields the same output, built from the input (objectives are echoed into
// the content). The output carries `metadata.generator = "mock"`; the service records the same
// fact in the material's `generation` field. It is never shown to students.

const OPTION_IDS = ["a", "b", "c", "d"] as const;
const MAX_ECHOED_OBJECTIVES = 5;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function keyword(text: string): string {
  const word = text.split(/[^\p{L}\p{N}]+/u).find((candidate) => candidate.length >= 5);
  return (word ?? "răspuns").toLowerCase();
}

function mcq(index: number, objective: Objective) {
  const correctIndex = index % OPTION_IDS.length;
  return {
    id: `q${index + 1}`,
    type: "mcq" as const,
    prompt: clip(
      `Care dintre afirmațiile următoare este adevărată? (Obiectiv: ${objective.text})`,
      900,
    ),
    options: OPTION_IDS.map((id, i) => ({
      id,
      text:
        i === correctIndex
          ? clip(`Afirmația corectă despre: ${objective.text}`, 600)
          : clip(`Afirmația ${i + 1}, incorectă, despre: ${objective.text}`, 600),
    })),
    correct: [OPTION_IDS[correctIndex] ?? "a"],
    explanation: `Varianta corectă este ${(OPTION_IDS[correctIndex] ?? "a").toUpperCase()}.`,
    objectiveId: objective.id,
  };
}

function short(index: number, objective: Objective) {
  const answer = keyword(objective.text);
  return {
    id: `q${index + 1}`,
    type: "short" as const,
    prompt: clip(`Răspunde pe scurt: ${objective.text}`, 900),
    acceptedAnswers: [answer, answer.toUpperCase()],
    explanation: `Răspunsul așteptat conține termenul „${answer}”.`,
    objectiveId: objective.id,
  };
}

function programming(index: number, objective: Objective, language: "cpp" | "python" | undefined) {
  const solution =
    language === "python"
      ? "# soluție de referință (mock)\nprint('ok')"
      : '#include <iostream>\nint main() {\n  // soluție de referință (mock)\n  std::cout << "ok";\n  return 0;\n}';
  return {
    id: `q${index + 1}`,
    type: "programming" as const,
    prompt: clip(`Scrie un program care ilustrează: ${objective.text}`, 900),
    referenceSolution: solution,
    rubric: "Programul compilează, produce rezultatul cerut și respectă obiectivul. (mock)",
    explanation: "Soluție de referință generată de mock.",
    objectiveId: objective.id,
  };
}

function questionFor(
  index: number,
  objective: Objective,
  kind: QuizInput["kind"],
  language: "cpp" | "python" | undefined,
) {
  if (kind === "problem") return programming(index, objective, language);
  if (kind === "exercise")
    return index % 2 === 0 ? short(index, objective) : programming(index, objective, language);
  return index % 2 === 0 ? mcq(index, objective) : short(index, objective);
}

export class MockGenerator implements ContentGenerator {
  readonly provider = "mock" as const;

  async generateLesson(input: LessonInput): Promise<unknown> {
    const echoed = input.objectives.slice(0, MAX_ECHOED_OBJECTIVES);
    const objectivesList = input.objectives.map((o) => `- ${o.text}`).join("\n");
    const explanation = [
      "## Explicație",
      `Această lecție acoperă capitolul „${input.chapterTitle}” din ${input.subjectTitle}.`,
      ...(input.sourceChunks.length > 0
        ? [
            `Material pregătit pe baza a ${input.sourceChunks.length} fragment(e) din documentele profesorului.`,
          ]
        : ["Material general, fără document sursă de la profesor."]),
      ...(input.styleNotes?.trim() ? ["Stilul de predare urmează notițele profesorului."] : []),
    ].join("\n\n");
    const example = ["## Exemplu rezolvat", ...echoed.map((o, i) => `${i + 1}. ${o.text}`)].join(
      "\n\n",
    );
    const sections = input.policy.exampleFirst ? [example, explanation] : [explanation, example];

    return {
      metadata: { generator: "mock" },
      lesson: {
        body: [
          `# ${clip(input.chapterTitle, 150)}`,
          `## Obiective\n${objectivesList}`,
          ...sections,
        ].join("\n\n"),
        examples: echoed.slice(0, 3).map((o, i) => ({
          title: `Exemplu ${i + 1}`,
          body: clip(`Exemplu pentru obiectivul: ${o.text}`, 900),
        })),
        checkQuestions: echoed.map((o, i) => mcq(i, o)),
      },
    };
  }

  async generateQuiz(input: QuizInput): Promise<unknown> {
    const objectives = input.objectives;
    return {
      metadata: { generator: "mock" },
      questions: Array.from({ length: input.count }, (_, i) => {
        const objective = objectives[i % objectives.length];
        return objective ? questionFor(i, objective, input.kind, input.language) : null;
      }).filter((q) => q !== null),
    };
  }

  async extractStyleNotes(input: StyleNotesInput): Promise<unknown> {
    const text = input.sampleText.trim();
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim() !== "");
    const averageWords = sentences.length > 0 ? Math.round(words.length / sentences.length) : 0;
    const hasCode = /```|#include|\bdef \w+\(|\bint main\b/.test(text);
    const hasHeadings = /^#{1,6}\s/m.test(text);
    return {
      metadata: { generator: "mock" },
      styleNotes: [
        `Propoziții de aproximativ ${averageWords} cuvinte (${averageWords > 20 ? "ton academic" : "ton direct"}).`,
        hasHeadings ? "Structură cu titluri și secțiuni clare." : "Text continuu, fără titluri.",
        hasCode
          ? "Include exemple de cod în explicații."
          : "Explicații fără cod, bazate pe descrieri.",
        "(Sugestie generată de mock; verifică și ajustează înainte de a o salva.)",
      ].join("\n"),
    };
  }

  async solveQuestions(input: SolveInput): Promise<unknown> {
    return {
      metadata: { generator: "mock" },
      answers: input.questions.map((q) =>
        q.type === "mcq"
          ? { questionId: q.id, correct: [q.options?.[0]?.id ?? "a"] }
          : q.type === "short"
            ? { questionId: q.id, acceptedAnswer: "mock" }
            : { questionId: q.id, solution: "// soluție mock" },
      ),
    };
  }

  async tutorReply(input: TutorInput): Promise<unknown> {
    const goal = clip(input.topicGoal, 200);
    const question = clip(input.question, 300);
    const turns = input.recentMessages.length;
    return {
      metadata: { generator: "mock" },
      reply: [
        `Răspuns de la tutorele mock pentru obiectivul „${goal}”.`,
        `Întrebarea ta: „${question}”.`,
        turns === 0
          ? "Aceasta este prima întrebare din conversație."
          : `Am în vedere ultimele ${turns} mesaje din conversație.`,
        input.policy.exampleFirst
          ? "Începem cu un exemplu, apoi explicația."
          : "Începem cu explicația, apoi un exemplu.",
        "(Răspuns generat de mock; nu este conținut real.)",
      ].join("\n\n"),
    };
  }

  // The correct option of a mock exercise depends on the strategy that preceded it, so a test can
  // tell which exercise it got: a/b/c/d/a/b... for strategy 0 (or none), 1, 2, ...
  async generatePracticeExercise(input: PracticeExerciseInput): Promise<unknown> {
    const index = input.strategy ? EXPLANATION_STRATEGIES.indexOf(input.strategy) + 1 : 0;
    return {
      metadata: { generator: "mock" },
      question: { ...mcq(index, input.objective), id: "q1" },
    };
  }

  async diagnosePracticeAnswer(input: PracticeDiagnosisInput): Promise<unknown> {
    return {
      metadata: { generator: "mock" },
      feedback: clip(
        `Răspunsul tău „${clip(input.submittedAnswer, 100)}” nu este corect pentru: ${input.question.prompt}`,
        1500,
      ),
      explanation: clip(
        `Explicație (${input.strategy}) pentru obiectivul „${input.objective.text}”. Strategii folosite înainte: ${input.previousStrategies.join(", ") || "niciuna"}. (Generat de mock.)`,
        3500,
      ),
    };
  }
}
