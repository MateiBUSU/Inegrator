// @vitest-environment jsdom
import type { AttemptResult as AttemptResultData, StudentQuestion } from "@app/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttemptResult } from "./attempt-result";

afterEach(cleanup);

// Explanations, rubrics and prompts come from an AI model: raw HTML must never reach the DOM.
// The sanitizer itself is covered in safe-markdown.test.tsx; this checks the result view uses it.
const EVIL = '<script>window.pwned = true</script><img src=x onerror="window.pwned = true">';

const QUESTIONS: StudentQuestion[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: `Alege ${EVIL}`,
    options: [
      { id: "a", text: "Prima" },
      { id: "b", text: "A doua" },
    ],
    objectiveId: "o1",
  },
  { id: "q2", type: "short", prompt: "Scurt", objectiveId: "o1" },
  { id: "q3", type: "programming", prompt: "Cod", objectiveId: "o1" },
];

const RESULT: AttemptResultData = {
  id: "11111111-1111-4111-8111-111111111111",
  materialId: "22222222-2222-4222-8222-222222222222",
  submittedAt: "2026-10-17T10:00:00.000Z",
  score: 1,
  maxScore: 2,
  selfEvaluationCount: 1,
  results: [
    {
      questionId: "q1",
      type: "mcq",
      objectiveId: "o1",
      isCorrect: true,
      selected: ["a"],
      correct: ["a"],
      explanation: `Explicație **bună** ${EVIL} [x](javascript:alert(1))`,
    },
    {
      questionId: "q2",
      type: "short",
      objectiveId: "o1",
      isCorrect: false,
      text: "for",
      acceptedAnswers: ["while"],
    },
    {
      questionId: "q3",
      type: "programming",
      objectiveId: "o1",
      evaluation: "self-evaluation",
      text: "<b>codul meu</b>",
      referenceSolution: "int main() {}",
      rubric: `Barem ${EVIL}`,
    },
  ],
};

describe("AttemptResult", () => {
  it("renders explanation, rubric and prompt without raw HTML or event handlers", () => {
    const { container } = render(<AttemptResult result={RESULT} questions={QUESTIONS} />);
    expect(container.querySelector("script, img, iframe")).toBeNull();
    expect(
      [...container.querySelectorAll("*")].some((el) =>
        [...el.attributes].some((attr) => attr.name.startsWith("on")),
      ),
    ).toBe(false);
    expect(container.innerHTML).not.toContain("javascript:");
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
    expect(container.querySelector(".explanation .markdown strong")?.textContent).toBe("bună"); // markdown still renders
  });

  it("shows the score, the key per question, and the student's own code as plain text", () => {
    const { container } = render(<AttemptResult result={RESULT} questions={QUESTIONS} />);
    expect(screen.getByText(/Scor: 1 din 2 · 50%/)).toBeTruthy();
    expect(screen.getByText("Corect")).toBeTruthy();
    expect(screen.getByText("Incorect")).toBeTruthy();
    expect(screen.getByText("while")).toBeTruthy(); // accepted answer
    expect(screen.getByText("int main() {}")).toBeTruthy(); // reference solution
    // the student's code is shown literally, not interpreted as markup
    expect(screen.getByText("<b>codul meu</b>")).toBeTruthy();
    expect(container.querySelector("pre b")).toBeNull();
  });
});
