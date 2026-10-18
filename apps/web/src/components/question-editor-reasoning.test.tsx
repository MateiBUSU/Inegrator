// @vitest-environment jsdom
import type { Question } from "@app/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionEditor } from "./question-editor";

afterEach(cleanup);

describe("QuestionEditor for a reasoning question", () => {
  it("shows the reference answer to the teacher, read-only", () => {
    const question: Question = {
      id: "r1",
      type: "reasoning",
      prompt: "Compară BFS și DFS.",
      referenceSolution: "BFS folosește o coadă, DFS o stivă.",
      objectiveId: "o1",
      verification: "unchecked",
    };
    render(
      <QuestionEditor
        question={question}
        number={3}
        objectives={[{ id: "o1", text: "Compară" }]}
        canConfirm
        modified={false}
        confirming={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const box = screen.getByLabelText(/Răspuns de referință/) as HTMLTextAreaElement;
    expect(box.value).toBe("BFS folosește o coadă, DFS o stivă.");
    expect(box.readOnly).toBe(true);
  });
});
