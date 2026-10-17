// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ObjectiveList } from "./objective-list";
import { HELP_UNAVAILABLE_NOTE, PracticeScreen } from "./practice-screen";

const mocks = vi.hoisted(() => ({
  startPractice: vi.fn(),
  submitPractice: vi.fn(),
  getPracticeProgress: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, practice: { ...mocks } } };
});

const UUID_E1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECTIVE = "62f01f15-0da6-47c1-b831-ff20c1682bd2";
const ex = (id: string, prompt: string) => ({
  id,
  objectiveId: OBJECTIVE,
  question: {
    id: "q1",
    type: "mcq" as const,
    prompt,
    options: [
      { id: "a", text: "Prima variantă" },
      { id: "b", text: "A doua variantă" },
    ],
    objectiveId: OBJECTIVE,
  },
});
const progress = (over: Record<string, unknown> = {}) => ({
  objectiveId: OBJECTIVE,
  status: "not_started",
  attemptsCount: 0,
  strategiesTried: [],
  currentExplanation: null,
  updatedAt: "2026-10-17T10:00:00.000Z",
  ...over,
});
const wrong = (over: Record<string, unknown> = {}) => ({
  correct: false,
  feedback: "Ai confundat valoarea cu referința.",
  explanation: "Gândește-te la o **adresă** de casă.",
  strategyUsed: "ANALOGIE",
  nextExercise: ex("e2", "Al doilea exercițiu"),
  progress: progress({ status: "struggling", attemptsCount: 1, strategiesTried: ["ANALOGIE"] }),
  ...over,
});

function renderScreen(onClose = () => {}) {
  return render(
    <PracticeScreen objectiveId={OBJECTIVE} objectiveText="Funcții" onClose={onClose} />,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});
afterEach(cleanup);

describe("PracticeScreen", () => {
  it("shows the exercise start returns (an existing unanswered one too) with one start call", async () => {
    mocks.startPractice.mockResolvedValue({
      exercise: ex("e1", "Primul exercițiu"),
      progress: progress({
        status: "struggling",
        attemptsCount: 2,
        strategiesTried: ["ANALOGIE", "PAS_CU_PAS"],
      }),
    });
    renderScreen();
    expect(await screen.findByText("Primul exercițiu")).toBeTruthy();
    expect(screen.getByText("Încercări: 2")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Explicații încercate: 2 din 6" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.startPractice).toHaveBeenCalledTimes(1);
  });

  it("a wrong answer shows feedback and explanation, and the next exercise only after Continuă", async () => {
    mocks.startPractice.mockResolvedValue({
      exercise: ex("e1", "Primul exercițiu"),
      progress: progress(),
    });
    mocks.submitPractice.mockResolvedValue(wrong());
    renderScreen();
    await userEvent.click(await screen.findByLabelText(/Prima variantă/));
    await userEvent.click(screen.getByRole("button", { name: "Trimite răspunsul" }));

    expect(mocks.submitPractice).toHaveBeenCalledWith(OBJECTIVE, "e1", { optionIds: ["a"] });
    expect(await screen.findByText("Ai confundat valoarea cu referința.")).toBeTruthy();
    expect(screen.getByText("adresă").tagName).toBe("STRONG"); // explanation goes through SafeMarkdown
    expect(screen.getByText(/O altă explicație: Analogie/)).toBeTruthy();
    expect(screen.queryByText("Al doilea exercițiu")).toBeNull(); // not auto-advanced
    expect(mocks.startPractice).toHaveBeenCalledTimes(1); // and no extra round trip

    await userEvent.click(screen.getByRole("button", { name: "Continuă" }));
    expect(await screen.findByText("Al doilea exercițiu")).toBeTruthy();
    expect(screen.queryByText("Ai confundat valoarea cu referința.")).toBeNull();
    expect(mocks.startPractice).toHaveBeenCalledTimes(1);
    // the new exercise starts with an empty answer
    expect((screen.getByLabelText(/Prima variantă/) as HTMLInputElement).checked).toBe(false);
  });

  it("a capped response shows the help state and no next exercise", async () => {
    mocks.startPractice.mockResolvedValue({
      exercise: ex("e1", "Primul exercițiu"),
      progress: progress(),
    });
    mocks.submitPractice.mockResolvedValue(
      wrong({
        capped: true,
        nextExercise: undefined,
        strategyUsed: "INTREBARE_SOCRATICA",
        progress: progress({ status: "struggling", attemptsCount: 6 }),
      }),
    );
    const onClose = vi.fn();
    renderScreen(onClose);
    await userEvent.click(await screen.findByLabelText(/Prima variantă/));
    await userEvent.click(screen.getByRole("button", { name: "Trimite răspunsul" }));

    expect(await screen.findByText(/Ai încercat toate variantele de explicație/)).toBeTruthy();
    expect(screen.getByText("Ai confundat valoarea cu referința.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuă" })).toBeNull();
    // No backend exists for the request, so the action is inert and says why.
    const help = screen.getByRole("button", {
      name: "Cere ajutor profesorului",
    }) as HTMLButtonElement;
    expect(help.disabled).toBe(true);
    expect(screen.getByText(HELP_UNAVAILABLE_NOTE)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Închide" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("start answering PRACTICE_CAPPED shows the help state", async () => {
    mocks.startPractice.mockRejectedValue(new ApiError(409, "PRACTICE_CAPPED"));
    renderScreen();
    expect(await screen.findByText(/Ai încercat toate variantele/)).toBeTruthy();
  });

  it("a correct answer confirms, marks mastered and waits for the student to close", async () => {
    mocks.startPractice.mockResolvedValue({
      exercise: ex("e1", "Primul exercițiu"),
      progress: progress(),
    });
    mocks.submitPractice.mockResolvedValue({
      correct: true,
      progress: progress({ status: "mastered", attemptsCount: 1 }),
    });
    const onClose = vi.fn();
    renderScreen(onClose);
    await userEvent.click(await screen.findByLabelText(/A doua variantă/));
    await userEvent.click(screen.getByRole("button", { name: "Trimite răspunsul" }));

    expect(await screen.findByText(/Corect! Ai stăpânit/)).toBeTruthy();
    expect(screen.getAllByText("Stăpânit").length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled(); // no auto-redirect
    await userEvent.click(screen.getByRole("button", { name: "Închide" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, "QUOTA_EXCEEDED", /limita zilnică/],
    [503, "AI_UNAVAILABLE", /nu este disponibilă momentan/],
  ])(
    "%s keeps the typed answer in the input and lets the student retry",
    async (status, code, text) => {
      const shortExercise = {
        id: "e1",
        objectiveId: OBJECTIVE,
        question: {
          id: "q1",
          type: "short" as const,
          prompt: "Cum se numește?",
          objectiveId: OBJECTIVE,
        },
      };
      mocks.startPractice.mockResolvedValue({ exercise: shortExercise, progress: progress() });
      mocks.submitPractice.mockRejectedValueOnce(new ApiError(status, code)).mockResolvedValue({
        correct: true,
        progress: progress({ status: "mastered", attemptsCount: 1 }),
      });
      renderScreen();
      const input = (await screen.findByLabelText("Răspunsul tău")) as HTMLInputElement;
      await userEvent.type(input, "referință");
      await userEvent.click(screen.getByRole("button", { name: "Trimite răspunsul" }));

      expect(await screen.findByText(text)).toBeTruthy();
      expect((screen.getByLabelText("Răspunsul tău") as HTMLInputElement).value).toBe("referință");

      await userEvent.click(screen.getByRole("button", { name: "Trimite răspunsul" }));
      expect(await screen.findByText(/Corect! Ai stăpânit/)).toBeTruthy();
      expect(mocks.submitPractice).toHaveBeenLastCalledWith(OBJECTIVE, "e1", { text: "referință" });
    },
  );

  it("shows a clear message when starting fails (quota / AI) and can retry", async () => {
    mocks.startPractice
      .mockRejectedValueOnce(new ApiError(503, "AI_UNAVAILABLE"))
      .mockResolvedValue({ exercise: ex("e1", "Primul exercițiu"), progress: progress() });
    renderScreen();
    expect(await screen.findByText(/nu este disponibilă momentan/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByText("Primul exercițiu")).toBeTruthy();
  });
});

// --- the exercise payload never holds an answer key --------------------------------------------

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      collectKeys(inner, keys);
    }
  }
  return keys;
}

describe("practice payloads", () => {
  it("the typed client drops answer-key fields even if the server sent them", async () => {
    const real = await vi.importActual<typeof import("../api/practice")>("../api/practice");
    const leaky = {
      exercise: {
        ...ex(UUID_E1, "Ce este?"),
        question: {
          ...ex(UUID_E1, "Ce este?").question,
          correct: ["a"],
          explanation: "SECRET",
          acceptedAnswers: ["SECRET"],
        },
      },
      progress: progress(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(leaky), { status: 200 })),
    );
    const started = await real.startPractice(OBJECTIVE);
    vi.unstubAllGlobals();

    const keys = collectKeys(JSON.parse(JSON.stringify(started.exercise)));
    for (const forbidden of [
      "correct",
      "acceptedAnswers",
      "referenceSolution",
      "rubric",
      "explanation",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    mocks.startPractice.mockResolvedValue(started);
    const { container } = renderScreen();
    expect(await screen.findByText("Ce este?")).toBeTruthy();
    expect(container.textContent).not.toContain("SECRET");
  });
});

// --- objective list: button and lazy badges ----------------------------------------------------

describe("ObjectiveList", () => {
  const objectives = [
    { id: OBJECTIVE, text: "Funcții cu parametri" },
    { id: "local-1", text: "Obiectiv fără catalog" },
  ];

  it("loads badges only when opened, once, and links to the practice screen", async () => {
    mocks.getPracticeProgress.mockResolvedValue(progress({ status: "mastered", attemptsCount: 3 }));
    render(
      <MemoryRouter initialEntries={["/student/materials/m1"]}>
        <ObjectiveList objectives={objectives} />
      </MemoryRouter>,
    );
    expect(mocks.getPracticeProgress).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("Obiective (2)"));
    expect(await screen.findByText("Stăpânit")).toBeTruthy();
    expect(mocks.getPracticeProgress).toHaveBeenCalledTimes(1); // only the catalogue objective

    const link = screen.getByRole("link", { name: "Exersează" });
    expect(link.getAttribute("href")).toBe(`/student/objectives/${OBJECTIVE}/practice`);
    expect(screen.getAllByRole("link")).toHaveLength(1);

    await userEvent.click(screen.getByText("Obiective (2)")); // close
    await userEvent.click(screen.getByText("Obiective (2)")); // open again
    expect(mocks.getPracticeProgress).toHaveBeenCalledTimes(1);
  });

  it("shows 'Neînceput' when there is no progress yet", async () => {
    mocks.getPracticeProgress.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <ObjectiveList objectives={objectives} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText("Obiective (2)"));
    await waitFor(() => expect(within(document.body).getByText("Neînceput")).toBeTruthy());
  });
});
