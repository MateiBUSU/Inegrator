// @vitest-environment jsdom
import type { StudentQuestion, SubmitAttemptRequest } from "@app/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAttemptPayload } from "../lib/attempt-payload";
import { AttemptForm } from "./attempt-form";

afterEach(cleanup);

const QUESTIONS: StudentQuestion[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: "Alege",
    options: [
      { id: "a", text: "Prima" },
      { id: "b", text: "A doua" },
    ],
    objectiveId: "o1",
  },
  { id: "q2", type: "short", prompt: "Scurt", objectiveId: "o1" },
  { id: "q3", type: "programming", prompt: "Scrie codul", objectiveId: "o1" },
];

describe("AttemptForm", () => {
  it("includes the programming textarea value in the submit payload", async () => {
    const onSubmit = vi.fn<(payload: SubmitAttemptRequest) => Promise<void>>(async () => {});
    const user = userEvent.setup();
    render(<AttemptForm questions={QUESTIONS} onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText(/Prima/));
    await user.type(screen.getByLabelText("Răspunsul tău"), "while");
    const code = "int main() {\n  return 0;\n}";
    await user.click(screen.getByLabelText("Codul tău"));
    await user.paste(code);
    await user.click(screen.getByRole("button", { name: "Trimite testul" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      answers: [
        { questionId: "q1", optionIds: ["a"] },
        { questionId: "q2", text: "while" },
        { questionId: "q3", text: code },
      ],
    });
  });

  it("leaves unanswered questions out and shows a rejected submit as an error", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("boom");
    });
    const user = userEvent.setup();
    render(<AttemptForm questions={QUESTIONS} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Trimite testul" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ answers: [] }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("buildAttemptPayload", () => {
  it("validates with the shared schema (text over the limit is refused client-side)", () => {
    const result = buildAttemptPayload(QUESTIONS, {
      q3: { optionIds: [], text: "x".repeat(20001) },
    });
    expect(result.ok).toBe(false);
  });
});
