import { EXPLANATION_STRATEGIES } from "@app/shared";
import type {
  ContentGenerator,
  LessonInput,
  Objective,
  PracticeDiagnosisInput,
  PracticeExerciseInput,
  QuizInput,
  ReasoningGradeInput,
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

/** Sentences of the teacher's source text, so the mock's questions visibly use the document. */
function sourceSentences(chunks: string[]): string[] {
  return chunks
    .flatMap((chunk) => chunk.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25 && sentence.length <= 300);
}

function mcqFromSource(index: number, objective: Objective, sentence: string) {
  const correctIndex = index % OPTION_IDS.length;
  return {
    ...mcq(index, objective),
    prompt: "Care dintre afirmațiile următoare apare în materialul de studiu?",
    options: OPTION_IDS.map((id, i) => ({
      id,
      text:
        i === correctIndex ? sentence : `Afirmație inventată ${i + 1}, absentă din material (mock)`,
    })),
    explanation: `Afirmația corectă este cea din material: „${clip(sentence, 200)}”`,
  };
}

function shortFromSource(index: number, objective: Objective, sentence: string) {
  const answer = keyword(sentence);
  const blanked = sentence.replace(new RegExp(answer, "i"), "_____");
  return {
    ...short(index, objective),
    prompt: clip(`Completează cu termenul care lipsește din material: „${blanked}”`, 900),
    acceptedAnswers: [answer, answer.toUpperCase()],
    explanation: `Termenul lipsă este „${answer}”.`,
  };
}

function questionFor(
  index: number,
  objective: Objective,
  kind: QuizInput["kind"],
  language: "cpp" | "python" | undefined,
  sentences: string[],
) {
  if (kind === "problem") return programming(index, objective, language);
  if (kind === "exercise")
    return index % 2 === 0 ? short(index, objective) : programming(index, objective, language);
  const sentence = sentences.length > 0 ? sentences[index % sentences.length] : undefined;
  if (index % 2 === 0)
    return sentence ? mcqFromSource(index, objective, sentence) : mcq(index, objective);
  return sentence ? shortFromSource(index, objective, sentence) : short(index, objective);
}

/** A class test with 4+ questions gets one open "reasoning" question, as the real prompt asks. */
const REASONING_INDEX = 2;

function reasoning(index: number, objective: Objective, sentences: string[]) {
  const reference =
    sentences.length > 0
      ? sentences.slice(0, 3).join(" ")
      : `Răspunsul complet pentru: ${objective.text} Explică ideea principală, motivul și un exemplu scurt. (referință mock)`;
  return {
    id: `q${index + 1}`,
    type: "reasoning" as const,
    prompt: clip(`Explică în câteva propoziții: ${objective.text}`, 900),
    referenceSolution: clip(reference, 4000),
    objectiveId: objective.id,
  };
}

/** Words of at least 5 letters, lowercased: what the mock grader compares. */
function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 5),
  );
}

const MIN_CHECK_QUESTIONS = 3;
const MAX_CHECK_QUESTIONS = 5;
const MAX_EXCERPTS = 3;

/**
 * A full lesson page, shaped like a real provider's: introduction, one section per objective (a
 * fixed outline for a single objective), a worked example and a summary. The text is canned, but
 * the policy changes its order and style and the teacher's source text is quoted.
 */
function lessonBody(input: LessonInput): string {
  const { objectives, policy } = input;
  const topic = clip(input.chapterTitle, 150);
  const goal = objectives.map((o) => o.text).join("; ");

  const intro = [
    "## Introducere",
    input.mode === "personal"
      ? `Acest material te ajută să înțelegi „${topic}”. Scopul tău: ${goal}.`
      : `Această lecție acoperă capitolul „${topic}” din ${input.subjectTitle}.`,
    policy.explanationLevel === "basic"
      ? "Pornim de la ideile simple și explicăm fiecare termen nou când apare."
      : policy.explanationLevel === "advanced"
        ? "Mergem direct la esență, inclusiv la cazurile limită."
        : "Parcurgem ideile în ordinea firească, introducând termenii pe rând.",
  ].join("\n\n");

  const outline =
    objectives.length > 1
      ? objectives.slice(0, MAX_ECHOED_OBJECTIVES).map((o) => ({
          title: clip(o.text.replace(/[.\s]+$/, ""), 120),
          text: `Aici explicăm punctul: ${o.text.replace(/[.\s]+$/, "")}.`,
        }))
      : [
          {
            title: "Ideea de bază",
            text: `Pornim de la ce înseamnă „${topic}” și de ce contează.`,
          },
          {
            title: "Cum funcționează",
            text: `Urmărim pe rând pașii prin care „${topic}” se aplică.`,
          },
          {
            title: "Greșeli frecvente",
            text: `Vedem unde se încurcă de obicei cei care învață „${topic}”.`,
          },
        ];
  const sections = outline.map((part) =>
    [
      `## ${part.title}`,
      part.text,
      policy.hintsEnabled
        ? "> Indiciu: încearcă mai întâi să formulezi singur ideea, apoi compar-o cu explicația."
        : "Explicația completă este dată direct, fără indicii separate.",
    ].join("\n\n"),
  );

  const excerpts = sourceSentences(input.sourceChunks).slice(0, MAX_EXCERPTS);
  const fromSource =
    excerpts.length > 0
      ? ["## Din materialul profesorului", ...excerpts.map((sentence) => `> ${sentence}`)].join(
          "\n\n",
        )
      : null;

  const steps = policy.scaffolding === "high" ? 4 : policy.scaffolding === "medium" ? 3 : 2;
  const example = [
    "## Exemplu rezolvat",
    `Exemplu pentru „${topic}”:`,
    ...Array.from({ length: steps }, (_, i) =>
      policy.scaffolding === "low"
        ? `- Etapa ${i + 1}: încearcă singur, apoi verifică.`
        : `${i + 1}. Pasul ${i + 1}: o acțiune mică, explicată separat.`,
    ),
  ].join("\n\n");

  const summary = [
    "## Recapitulare",
    ...objectives.slice(0, MAX_ECHOED_OBJECTIVES).map((o) => `- ${o.text}`),
    "_(Text generat de modulul de test (mock), nu de un model AI real.)_",
  ].join("\n\n");

  return [
    `# ${topic}`,
    intro,
    ...(policy.exampleFirst ? [example, ...sections] : [...sections, example]),
    ...(fromSource ? [fromSource] : []),
    summary,
  ].join("\n\n");
}

export class MockGenerator implements ContentGenerator {
  readonly provider = "mock" as const;

  async generateLesson(input: LessonInput): Promise<unknown> {
    const echoed = input.objectives.slice(0, MAX_ECHOED_OBJECTIVES);
    const sentences = sourceSentences(input.sourceChunks);
    const checkCount = Math.min(
      MAX_CHECK_QUESTIONS,
      Math.max(MIN_CHECK_QUESTIONS, input.objectives.length),
    );
    return {
      metadata: { generator: "mock" },
      lesson: {
        body: lessonBody(input),
        examples: echoed.slice(0, 3).map((o, i) => ({
          title: `Exemplu ${i + 1}`,
          body: clip(`Exemplu pentru obiectivul: ${o.text}`, 900),
        })),
        checkQuestions: Array.from({ length: checkCount }, (_, i) => {
          const objective = echoed[i % echoed.length];
          if (!objective) return null;
          const sentence = sentences[i % Math.max(sentences.length, 1)];
          return sentence ? mcqFromSource(i, objective, sentence) : mcq(i, objective);
        }).filter((q) => q !== null),
      },
    };
  }

  async generateQuiz(input: QuizInput): Promise<unknown> {
    const objectives = input.objectives;
    const sentences = sourceSentences(input.sourceChunks);
    return {
      metadata: { generator: "mock" },
      questions: Array.from({ length: input.count }, (_, i) => {
        const objective = objectives[i % objectives.length];
        if (!objective) return null;
        const withReasoning =
          input.mode !== "personal" && (input.kind ?? "test") === "test" && input.count >= 4;
        return withReasoning && i === REASONING_INDEX
          ? reasoning(i, objective, sentences)
          : questionFor(i, objective, input.kind, input.language, sentences);
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

  // Deterministic: the share of the reference's keywords found in the answer decides the verdict
  // (>= 50% CORECT, >= 20% PARTIAL, else GRESIT). The feedback never repeats the reference.
  async gradeReasoningAnswer(input: ReasoningGradeInput): Promise<unknown> {
    const wanted = keywords(input.referenceAnswer);
    const given = keywords(input.studentAnswer);
    const found = [...wanted].filter((word) => given.has(word)).length;
    const share = wanted.size === 0 ? 0 : found / wanted.size;
    const verdict = share >= 0.5 ? "CORECT" : share >= 0.2 ? "PARTIAL" : "GRESIT";
    return {
      metadata: { generator: "mock" },
      verdict,
      feedback: clip(
        `Răspunsul tău „${clip(input.studentAnswer, 120)}” acoperă aproximativ ${Math.round(share * 100)}% din ideile esențiale ale răspunsului de referință. (Evaluare generată de mock.)`,
        2500,
      ),
      ...(verdict === "CORECT"
        ? {}
        : {
            explanation: clip(
              `Reia ideea obiectivului „${input.objective.text}” și formulează răspunsul cu termenii cheie. (Explicație generată de mock.)`,
              3500,
            ),
          }),
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
