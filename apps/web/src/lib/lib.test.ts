import { materialDefinitionSchema, type Question } from "@app/shared";
import { describe, expect, it } from "vitest";
import { buildGenerateRequest, generateFormSchema } from "../forms/generate-schema";
import {
  confirmed,
  lessonMaterial,
  mcq,
  OBJECTIVES,
  programmingQuestion,
  shortQuestion,
  testMaterial,
} from "../test/fixtures";
import { formatDate, formatDateTime, formatKb } from "./format";
import { gradeLabel, KIND_LABELS, STATUS_LABELS } from "./labels";
import {
  canPublish,
  isConfirmed,
  publishBlockReason,
  questionLabel,
  questionLabels,
  questionNumber,
  unconfirmedQuestions,
} from "./material-state";
import {
  acceptedAnswersToText,
  addOption,
  MAX_OPTIONS,
  nextOptionId,
  removeOption,
  setOptionText,
  textToAcceptedAnswers,
  toggleCorrect,
} from "./question-editing";
import { issuesToRomanian, issueToRomanian } from "./validation-messages";

describe("material-state: publish gating", () => {
  const draft = (questions: Question[]) => testMaterial({ questions });

  it("cannot publish while any question is unconfirmed, and names them", () => {
    const material = draft([confirmed(mcq("q1")), shortQuestion("q2"), programmingQuestion("q3")]);
    expect(canPublish(material, false)).toBe(false);
    expect(unconfirmedQuestions(material).map((q) => q.id)).toEqual(["q2", "q3"]);
    expect(publishBlockReason(material, false)).toBe(
      "Confirmă răspunsurile corecte înainte de publicare. Neconfirmate: Întrebarea 2, Întrebarea 3.",
    );
  });

  it("can publish once every question is confirmed", () => {
    const material = draft([confirmed(mcq("q1")), confirmed(shortQuestion("q2"))]);
    expect(canPublish(material, false)).toBe(true);
    expect(publishBlockReason(material, false)).toBeNull();
  });

  it("cannot publish with unsaved edits, whatever the confirmations say", () => {
    const material = draft([confirmed(mcq("q1"))]);
    expect(canPublish(material, true)).toBe(false);
    expect(publishBlockReason(material, true)).toBe("Salvează modificările înainte de a publica.");
  });

  it("only a draft can be published", () => {
    const published = testMaterial({ status: "published", questions: [confirmed(mcq("q1"))] });
    expect(canPublish(published, false)).toBe(false);
    expect(canPublish({ ...published, status: "archived" }, false)).toBe(false);
  });

  it("treats only teacher_confirmed as confirmed (not 'agrees' or 'needs_review')", () => {
    expect(isConfirmed({ verification: "teacher_confirmed" })).toBe(true);
    for (const verification of ["unchecked", "agrees", "needs_review"] as const) {
      expect(isConfirmed({ verification })).toBe(false);
      expect(canPublish(draft([{ ...mcq("q1"), verification }]), false)).toBe(false);
    }
  });

  it("allows a material with nothing to confirm (a lesson without check questions)", () => {
    expect(canPublish(lessonMaterial([]), false)).toBe(true);
    expect(canPublish(draft([]), false)).toBe(true);
  });

  it("counts lesson check questions too", () => {
    expect(canPublish(lessonMaterial([mcq("q1")]), false)).toBe(false);
    expect(canPublish(lessonMaterial([confirmed(mcq("q1"))]), false)).toBe(true);
  });

  it("numbers questions from 1 in the order they are shown", () => {
    const material = draft([mcq("a"), mcq("b"), mcq("c")]);
    expect(questionNumber(material, "b")).toBe(2);
    expect(questionNumber(material, "nope")).toBeNull();
    expect(questionLabel(material, "c")).toBe("Întrebarea 3");
    expect(questionLabel(material, "nope")).toBe("O întrebare necunoscută");
    expect(questionLabels(material, ["c", "a"])).toBe("Întrebarea 3, Întrebarea 1");
  });
});

describe("question-editing", () => {
  const q = mcq("q1");

  it("adds options with the next free letter, up to the maximum", () => {
    expect(nextOptionId(["a", "b"])).toBe("c");
    expect(nextOptionId(["a", "c"])).toBe("b");
    expect(nextOptionId("abcdefghij".split(""))).toBe("o11");
    let grown = q;
    for (let i = 0; i < 20; i++) grown = addOption(grown);
    expect(grown.options).toHaveLength(MAX_OPTIONS);
    expect(addOption(q).options?.at(-1)).toEqual({ id: "c", text: "" });
  });

  it("removes an option and drops it from the correct answers, but never goes below two", () => {
    const three = addOption(q);
    const removed = removeOption({ ...three, correct: ["a", "c"] }, "c");
    expect(removed.options?.map((o) => o.id)).toEqual(["a", "b"]);
    expect(removed.correct).toEqual(["a"]);
    expect(removeOption(q, "a")).toBe(q); // already at two options
  });

  it("toggles correct answers and edits option text without mutating the input", () => {
    const before = JSON.stringify(q);
    expect(toggleCorrect(q, "b").correct).toEqual(["a", "b"]);
    expect(toggleCorrect(q, "a").correct).toEqual([]);
    expect(setOptionText(q, "b", "Nou").options?.[1]?.text).toBe("Nou");
    expect(JSON.stringify(q)).toBe(before);
  });

  it("converts accepted answers to and from one-per-line text", () => {
    expect(acceptedAnswersToText(["while", "WHILE"])).toBe("while\nWHILE");
    expect(acceptedAnswersToText(undefined)).toBe("");
    expect(textToAcceptedAnswers(" while \n\n  WHILE\n")).toEqual(["while", "WHILE"]);
    expect(textToAcceptedAnswers("   \n ")).toEqual([]);
  });
});

describe("validation-messages: every problem the shared schema can report is understandable", () => {
  const base = {
    title: "T",
    kind: "test",
    section: "programa",
    language: "cpp",
    grade: 9,
    objectives: OBJECTIVES,
  };
  const problems = (definition: unknown) => {
    const result = materialDefinitionSchema.safeParse(definition);
    return result.success ? [] : issuesToRomanian(result.error.issues);
  };

  it.each([
    [
      "an mcq with one option",
      { ...base, questions: [mcq("q1", { options: [{ id: "a", text: "x" }], correct: ["a"] })] },
      "Întrebarea 1 are nevoie de cel puțin 2 opțiuni.",
    ],
    [
      "duplicate option ids",
      {
        ...base,
        questions: [
          mcq("q1", {
            options: [
              { id: "a", text: "x" },
              { id: "a", text: "y" },
            ],
          }),
        ],
      },
      "Întrebarea 1 are opțiuni cu același identificator.",
    ],
    [
      "no correct answer",
      { ...base, questions: [mcq("q1", { correct: [] })] },
      "Întrebarea 1 are nevoie de cel puțin un răspuns corect bifat.",
    ],
    [
      "a correct id that is not an option",
      { ...base, questions: [mcq("q1", { correct: ["zz"] })] },
      "Întrebarea 1 are un răspuns corect care nu se află printre opțiuni.",
    ],
    [
      "a short question without answers",
      { ...base, questions: [mcq("q1"), shortQuestion("q2", { acceptedAnswers: [] })] },
      "Întrebarea 2 are nevoie de cel puțin un răspuns acceptat.",
    ],
    [
      "a programming question without a solution",
      { ...base, questions: [programmingQuestion("q1", { referenceSolution: " " })] },
      "Întrebarea 1 are nevoie de o soluție de referință.",
    ],
    [
      "an empty prompt",
      { ...base, questions: [mcq("q1", { prompt: "" })] },
      "Întrebarea 1: Enunțul nu poate fi gol.",
    ],
    [
      "an empty option text",
      {
        ...base,
        questions: [
          mcq("q1", {
            options: [
              { id: "a", text: "" },
              { id: "b", text: "y" },
            ],
          }),
        ],
      },
      "Întrebarea 1: Textul unei opțiuni nu poate fi gol.",
    ],
    ["an empty title", { ...base, title: "  ", questions: [mcq("q1")] }, "Titlul nu poate fi gol."],
    [
      "bac with python",
      { ...base, section: "bac", language: "python", questions: [mcq("q1")] },
      "Materialele pentru bacalaureat folosesc doar C++.",
    ],
    [
      "a duplicate question id",
      { ...base, questions: [mcq("q1"), mcq("q1")] },
      "Două întrebări au același identificator.",
    ],
    [
      "an objective that is not in the material",
      { ...base, questions: [mcq("q1", { objectiveId: "nope" })] },
      "Întrebarea 1: obiectivul ales nu face parte din materialul acesta.",
    ],
    [
      "an empty lesson body",
      { ...lessonMaterial([]), lesson: { body: "", examples: [], checkQuestions: [] } },
      "Textul lecției nu poate fi gol.",
    ],
  ])("explains %s in Romanian", (_name, definition, expected) => {
    expect(problems(definition)).toContain(expected);
  });

  it("never leaves English text in the message list for the problems above", () => {
    const all = [
      { ...base, questions: [mcq("q1", { options: [{ id: "a", text: "x" }], correct: [] })] },
      {
        ...base,
        questions: [
          mcq("q1", { prompt: "", correct: ["zz"] }),
          shortQuestion("q2", { acceptedAnswers: [] }),
        ],
      },
      {
        ...base,
        section: "bac",
        language: "python",
        title: "",
        questions: [mcq("q1", { objectiveId: "nope" })],
      },
    ];
    for (const definition of all) {
      for (const message of problems(definition)) {
        expect(message).not.toMatch(
          /\b(needs|must|expected|too small|too big|invalid input|duplicate|present in)\b/i,
        );
      }
    }
  });

  it("falls back to a readable generic sentence for an unknown problem", () => {
    expect(issueToRomanian({ message: "something odd", path: ["questions", 1, "weird"] })).toBe(
      "Întrebarea 2: Un câmp nu este valid.",
    );
    expect(issueToRomanian({ message: "x", code: "too_big", path: ["title"] })).toBe(
      "Titlul este prea lung.",
    );
    expect(
      issuesToRomanian([
        { message: "a", code: "too_small", path: ["title"] },
        { message: "b", code: "too_small", path: ["title"] },
      ]),
    ).toHaveLength(1);
  });
});

describe("generate form schema and request", () => {
  const values = {
    classId: "c",
    subjectId: "s",
    chapterId: "ch",
    kind: "test" as const,
    objectiveIds: ["o1", "o2"],
    documentIds: [] as string[],
    count: 6,
  };

  it("builds the API request: documentIds only when chosen, count only for non-lessons", () => {
    expect(buildGenerateRequest(values)).toEqual({
      classId: "c",
      subjectId: "s",
      chapterId: "ch",
      kind: "test",
      objectiveIds: ["o1", "o2"],
      count: 6,
    });
    expect(buildGenerateRequest({ ...values, kind: "lesson" })).toEqual({
      classId: "c",
      subjectId: "s",
      chapterId: "ch",
      kind: "lesson",
      objectiveIds: ["o1", "o2"],
    });
    expect(buildGenerateRequest({ ...values, documentIds: ["d1"] })).toMatchObject({
      documentIds: ["d1"],
    });
  });

  it("rejects missing choices and out-of-range counts with Romanian messages", () => {
    const messages = (input: object) => {
      const result = generateFormSchema.safeParse({ ...values, ...input });
      return result.success ? [] : result.error.issues.map((i) => i.message);
    };
    expect(messages({})).toEqual([]);
    expect(messages({ classId: "", subjectId: "", chapterId: "", objectiveIds: [] })).toEqual([
      "Alege clasa.",
      "Alege subiectul.",
      "Alege capitolul.",
      "Alege cel puțin un obiectiv.",
    ]);
    expect(messages({ count: 0 })).toEqual(["Numărul de întrebări trebuie să fie între 1 și 20."]);
    expect(messages({ count: 21 })).toEqual(["Numărul de întrebări trebuie să fie între 1 și 20."]);
    expect(messages({ count: Number.NaN })).toEqual(["Introdu numărul de întrebări."]);
    expect(messages({ count: 2.5 })).toEqual(["Numărul de întrebări trebuie să fie întreg."]);
  });
});

describe("format and labels", () => {
  it("rounds sizes up, so a size over a limit never looks equal to it", () => {
    expect(formatKb(204800)).toBe("200,0 KB");
    expect(formatKb(204801)).toBe("200,1 KB");
    expect(formatKb(0)).toBe("0,0 KB");
    expect(formatKb(1536)).toBe("1,5 KB");
  });

  it("formats dates in Romanian and returns unparseable input unchanged", () => {
    expect(formatDate("2026-10-17T10:00:00.000Z")).toMatch(/2026/);
    expect(formatDateTime("2026-10-17T10:00:00.000Z")).toMatch(/2026/);
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDateTime("")).toBe("");
  });

  it("has a Romanian label for every kind, status and grade", () => {
    expect(Object.values(KIND_LABELS)).toEqual(["Lecție", "Test", "Probleme", "Exerciții"]);
    expect(Object.values(STATUS_LABELS)).toEqual(["Ciornă", "Publicat", "Arhivat"]);
    expect([9, 10, 11, 12].map(gradeLabel)).toEqual([
      "clasa a IX-a",
      "clasa a X-a",
      "clasa a XI-a",
      "clasa a XII-a",
    ]);
  });
});
