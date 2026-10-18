// @vitest-environment jsdom
import type { AttemptResult as AttemptResultData, StudentQuestion } from "@app/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AttemptForm } from "./attempt-form";
import { AttemptResult } from "./attempt-result";

afterEach(cleanup);

const QUESTIONS: StudentQuestion[] = [
  { id: "r1", type: "reasoning", prompt: "Compară BFS și DFS.", objectiveId: "o1" },
];

const resultWith = (
  reasoning: Extract<AttemptResultData["results"][number], { type: "reasoning" }>,
): AttemptResultData => ({
  id: "11111111-1111-4111-8111-111111111111",
  materialId: "22222222-2222-4222-8222-222222222222",
  submittedAt: "2026-10-18T10:00:00.000Z",
  score: reasoning.points,
  maxScore: 1,
  selfEvaluationCount: 0,
  results: [reasoning],
});

describe("reasoning question: input", () => {
  it("is a textarea whose text goes into the payload", async () => {
    const onSubmit = vi.fn(async () => {});
    const user = userEvent.setup();
    render(<AttemptForm questions={QUESTIONS} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Răspunsul tău"), "BFS folosește o coadă");
    await user.click(screen.getByRole("button", { name: "Trimite testul" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]).toEqual([
      { answers: [{ questionId: "r1", text: "BFS folosește o coadă" }] },
    ]);
  });

  it("a 503 from the grader says it could not evaluate and keeps what was written", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "AI_UNAVAILABLE"))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<AttemptForm questions={QUESTIONS} onSubmit={onSubmit} />);
    const box = screen.getByLabelText("Răspunsul tău");
    await user.type(box, "răspunsul meu lung");
    await user.click(screen.getByRole("button", { name: "Trimite testul" }));
    expect(await screen.findByText(/Nu am putut evalua răspunsurile acum/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("răspunsul meu lung");

    await user.click(screen.getByRole("button", { name: "Trimite testul" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]).toEqual(onSubmit.mock.calls[0]);
  });
});

describe("reasoning question: result", () => {
  it("shows the verdict, feedback and re-explanation through markdown, never raw HTML", () => {
    const { container } = render(
      <AttemptResult
        questions={QUESTIONS}
        result={resultWith({
          questionId: "r1",
          objectiveId: "o1",
          type: "reasoning",
          text: "BFS merge pe niveluri",
          verdict: "PARTIAL",
          points: 0.5,
          feedback: "Ai spus **coada**, dar lipsește DFS. <script>window.pwned = true</script>",
          reexplanation: "DFS merge în adâncime.",
        })}
      />,
    );
    expect(screen.getByText("Parțial corect", { selector: ".badge" })).toBeTruthy();
    expect(screen.getByText(/0,5 din 1/)).toBeTruthy();
    expect(screen.getByText("BFS merge pe niveluri")).toBeTruthy();
    expect(screen.getByText("coada").tagName).toBe("STRONG");
    expect(screen.getByText("DFS merge în adâncime.")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Scor: 0,5 din 1");
  });

  it("a CORECT answer has no re-explanation block", () => {
    render(
      <AttemptResult
        questions={QUESTIONS}
        result={resultWith({
          questionId: "r1",
          objectiveId: "o1",
          type: "reasoning",
          text: "ok",
          verdict: "CORECT",
          points: 1,
          feedback: "Complet.",
        })}
      />,
    );
    expect(screen.queryByText("Pe înțelesul tău:")).toBeNull();
  });
});
