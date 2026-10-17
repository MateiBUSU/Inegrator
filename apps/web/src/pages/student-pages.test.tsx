// @vitest-environment jsdom
import type { StudentMaterialView } from "@app/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentMaterialPage } from "./student-material-page";
import { StudentProgressPage } from "./student-progress-page";

const mocks = vi.hoisted(() => ({
  getMaterial: vi.fn(),
  listMyProgress: vi.fn(),
  listMyMaterials: vi.fn(),
  setProgress: vi.fn(),
  getGamification: vi.fn(),
  submitAttempt: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      materials: { getMaterial: mocks.getMaterial },
      me: {
        listMyProgress: mocks.listMyProgress,
        listMyMaterials: mocks.listMyMaterials,
        setProgress: mocks.setProgress,
        getGamification: mocks.getGamification,
      },
      attempts: { submitAttempt: mocks.submitAttempt },
    },
  };
});

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const lesson: StudentMaterialView = {
  id: ID,
  version: 1,
  title: "Bucle while",
  kind: "lesson",
  section: "programa",
  language: "cpp",
  grade: 9,
  objectives: [{ id: "o1", text: "Scrie bucle" }],
  lesson: {
    body: 'Text **important**\n\n<script>window.pwned = true</script><img src=x onerror="window.pwned = true">',
    examples: [],
    checkQuestions: [],
  },
};

function renderMaterial() {
  return render(
    <MemoryRouter initialEntries={[`/student/materials/${ID}`]}>
      <Routes>
        <Route path="/student/materials/:id" element={<StudentMaterialPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

describe("StudentMaterialPage (lesson)", () => {
  it("marks the lesson started on open, then completed on click, and sanitizes the body", async () => {
    mocks.getMaterial.mockResolvedValue(lesson);
    mocks.listMyProgress.mockResolvedValue([]);
    mocks.setProgress.mockImplementation(async (_id: string, status: string) => ({
      materialId: ID,
      status,
      updatedAt: "2026-10-17T10:00:00.000Z",
    }));
    const { container } = renderMaterial();

    expect(await screen.findByText("important")).toBeTruthy();
    await waitFor(() => expect(mocks.setProgress).toHaveBeenCalledWith(ID, "started"));
    expect(container.querySelector("script, img")).toBeNull();
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Marchează ca încheiată" }));
    await waitFor(() => expect(mocks.setProgress).toHaveBeenLastCalledWith(ID, "completed"));
    expect(mocks.setProgress).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("button", { name: "Lecție încheiată" })).toBeTruthy();
  });

  it("does not downgrade a completed lesson back to started", async () => {
    mocks.getMaterial.mockResolvedValue(lesson);
    mocks.listMyProgress.mockResolvedValue([
      { materialId: ID, status: "completed", updatedAt: "2026-10-17T10:00:00.000Z" },
    ]);
    renderMaterial();
    expect(await screen.findByRole("button", { name: "Lecție încheiată" })).toBeTruthy();
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });
});

describe("StudentProgressPage", () => {
  it("shows the gamification fields as returned, including zeros", async () => {
    mocks.getGamification.mockResolvedValue({
      currentStreakDays: 0,
      weeklyActivityCount: 0,
      weeklyGoal: 3,
      pointsTotal: 0,
      level: "Începător",
      nextLevelAt: 50,
    });
    mocks.listMyProgress.mockResolvedValue([]);
    mocks.listMyMaterials.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <StudentProgressPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("0 zile")).toBeTruthy();
    expect(screen.getByText("0 din 3")).toBeTruthy();
    expect(screen.getByText("Începător")).toBeTruthy();
    expect(screen.getByText("Următorul nivel la 50 puncte")).toBeTruthy();
    expect(screen.getByText("Nu ai început încă niciun material.")).toBeTruthy();
  });
});

describe("StudentMaterialPage (test, problem, exercise)", () => {
  const attempt = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    materialId: ID,
    submittedAt: "2026-10-17T10:00:00.000Z",
    score: 0,
    maxScore: 1,
    selfEvaluationCount: 0,
    results: [
      {
        questionId: "q1",
        type: "short",
        objectiveId: "o1",
        isCorrect: false,
        text: "for",
        acceptedAnswers: ["while"],
      },
    ],
  };

  function questionMaterial(kind: "test" | "problem" | "exercise"): StudentMaterialView {
    return {
      id: ID,
      version: 1,
      title: "Material",
      kind,
      section: "programa",
      language: "cpp",
      grade: 9,
      objectives: [{ id: "o1", text: "Scrie bucle" }],
      questions: [{ id: "q1", type: "short", prompt: "Cuvânt?", objectiveId: "o1" }],
    };
  }

  async function submitAnswer() {
    await userEvent.type(await screen.findByLabelText("Răspunsul tău"), "for");
    await userEvent.click(screen.getByRole("button", { name: "Trimite testul" }));
  }

  it.each(["test", "problem", "exercise"] as const)(
    "marks a %s completed after the attempt, even with a score of 0",
    async (kind) => {
      mocks.getMaterial.mockResolvedValue(questionMaterial(kind));
      mocks.listMyProgress.mockResolvedValue([]);
      mocks.submitAttempt.mockResolvedValue(attempt);
      mocks.setProgress.mockResolvedValue({
        materialId: ID,
        status: "completed",
        updatedAt: "2026-10-17T10:00:00.000Z",
      });
      renderMaterial();
      await submitAnswer();

      await waitFor(() => expect(mocks.setProgress).toHaveBeenCalledWith(ID, "completed"));
      expect(mocks.setProgress).toHaveBeenCalledTimes(1); // no "started" call for these kinds
      expect(await screen.findByText(/Scor: 0 din 1/)).toBeTruthy();
    },
  );

  it("still shows the result when the progress call fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getMaterial.mockResolvedValue(questionMaterial("test"));
    mocks.listMyProgress.mockResolvedValue([]);
    mocks.submitAttempt.mockResolvedValue(attempt);
    mocks.setProgress.mockRejectedValue(new Error("down"));
    renderMaterial();
    await submitAnswer();

    expect(await screen.findByText(/Scor: 0 din 1/)).toBeTruthy();
    await waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    log.mockRestore();
  });

  it("does not mark anything completed when the attempt itself fails", async () => {
    mocks.getMaterial.mockResolvedValue(questionMaterial("test"));
    mocks.listMyProgress.mockResolvedValue([]);
    mocks.submitAttempt.mockRejectedValue(new Error("nope"));
    renderMaterial();
    await submitAnswer();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });
});
