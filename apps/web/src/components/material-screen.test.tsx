// @vitest-environment jsdom
import { allQuestions, type Question, type TeacherMaterial } from "@app/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import {
  confirmed,
  lessonMaterial,
  mcq,
  programmingQuestion,
  shortQuestion,
  testMaterial,
} from "../test/fixtures";
import { MaterialScreen } from "./material-screen";

const mocks = vi.hoisted(() => ({
  updateMaterial: vi.fn(),
  confirmQuestions: vi.fn(),
  publishMaterial: vi.fn(),
  getMaterial: vi.fn(),
  createNewVersion: vi.fn(),
  assignMaterial: vi.fn(),
  listClasses: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      materials: {
        updateMaterial: mocks.updateMaterial,
        confirmQuestions: mocks.confirmQuestions,
        publishMaterial: mocks.publishMaterial,
        getMaterial: mocks.getMaterial,
        createNewVersion: mocks.createNewVersion,
        assignMaterial: mocks.assignMaterial,
      },
      classes: { listClasses: mocks.listClasses },
    },
  };
});

/**
 * A stand-in for the server's rules about a single material: confirming marks questions,
 * editing resets the confirmation of changed questions, and publishing needs everything
 * confirmed. The component tests drive the real UI against it.
 */
function fakeServer(initial: TeacherMaterial) {
  let current: TeacherMaterial = structuredClone(initial);
  const snapshot = () => structuredClone(current);
  const setQuestions = (fn: (q: Question) => Question) => {
    if (current.questions) current.questions = current.questions.map(fn);
    if (current.lesson) current.lesson.checkQuestions = current.lesson.checkQuestions.map(fn);
  };

  mocks.getMaterial.mockImplementation(async () => snapshot());
  mocks.confirmQuestions.mockImplementation(async (_id: string, ids: string[]) => {
    setQuestions((q) => (ids.includes(q.id) ? { ...q, verification: "teacher_confirmed" } : q));
    return snapshot();
  });
  mocks.updateMaterial.mockImplementation(
    async (
      _id: string,
      patch: { title?: string; questions?: Question[]; lesson?: TeacherMaterial["lesson"] },
    ) => {
      const before = new Map(allQuestions(current).map((q) => [q.id, q]));
      const reconcile = (q: Question): Question => {
        const old = before.get(q.id);
        const same =
          old !== undefined &&
          JSON.stringify({ ...old, verification: undefined }) ===
            JSON.stringify({ ...q, verification: undefined });
        return { ...q, verification: same ? old.verification : "unchecked" };
      };
      if (patch.title !== undefined) current.title = patch.title;
      if (patch.questions) current.questions = patch.questions.map(reconcile);
      if (patch.lesson) {
        current.lesson = {
          ...patch.lesson,
          checkQuestions: patch.lesson.checkQuestions.map(reconcile),
        };
      }
      return snapshot();
    },
  );
  mocks.publishMaterial.mockImplementation(async () => {
    const pending = allQuestions(current).filter((q) => q.verification !== "teacher_confirmed");
    if (pending.length > 0) {
      throw new ApiError(409, "UNCONFIRMED_QUESTIONS", { questionIds: pending.map((q) => q.id) });
    }
    current = { ...current, status: "published", publishedAt: "2026-10-18T10:00:00.000Z" };
    return snapshot();
  });
  return {
    get: snapshot,
    /** Simulates a change made elsewhere (another tab, or a race with the user's click). */
    mutate: (fn: (m: TeacherMaterial) => void) => fn(current),
  };
}

const renderScreen = (material: TeacherMaterial) =>
  render(
    <MemoryRouter>
      <MaterialScreen initial={material} />
    </MemoryRouter>,
  );

// The counter is split over several elements (<strong>), so match on the whole paragraph text.
const confirmedCount = (done: number, total: number) =>
  screen.getByText(
    (_content, element) =>
      element?.tagName === "P" &&
      element.textContent === `${done} din ${total} întrebări confirmate.`,
  );

const publishButton = () =>
  screen.getByRole("button", { name: "Publică materialul" }) as HTMLButtonElement;
const questionCard = (n: number) => screen.getByRole("article", { name: `Întrebarea ${n}` });
const confirmButtonOf = (n: number) =>
  within(questionCard(n)).getByRole("button", { name: "Confirmă răspunsul" }) as HTMLButtonElement;
const saveButton = () =>
  screen.getByRole("button", { name: "Salvează modificările" }) as HTMLButtonElement;

beforeEach(() => {
  mocks.listClasses.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("publish gating", () => {
  it("keeps Publish disabled while any question is unconfirmed, and enables it once all are confirmed", async () => {
    fakeServer(testMaterial()); // two unconfirmed questions
    const u = userEvent.setup();
    renderScreen(testMaterial());

    expect(publishButton().disabled).toBe(true);
    expect(screen.getByText(/Neconfirmate: Întrebarea 1, Întrebarea 2/)).not.toBeNull();
    expect(confirmedCount(0, 2)).not.toBeNull();

    await u.click(confirmButtonOf(1));
    await waitFor(() => expect(confirmedCount(1, 2)).not.toBeNull());
    expect(publishButton().disabled).toBe(true); // one question is still unconfirmed
    expect(screen.getByText(/Neconfirmate: Întrebarea 2\./)).not.toBeNull();

    await u.click(confirmButtonOf(2));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    expect(screen.queryByText(/Neconfirmate/)).toBeNull();
    expect(confirmedCount(2, 2)).not.toBeNull();
    expect(mocks.confirmQuestions.mock.calls.map((call) => call[1])).toEqual([["q1"], ["q2"]]);
  });

  it("shows which questions are confirmed and which are not", async () => {
    fakeServer(testMaterial({ questions: [confirmed(mcq("q1")), shortQuestion("q2")] }));
    renderScreen(testMaterial({ questions: [confirmed(mcq("q1")), shortQuestion("q2")] }));
    expect(within(questionCard(1)).getByText("Confirmat")).not.toBeNull();
    expect(within(questionCard(2)).getByText("Neconfirmat")).not.toBeNull();
    // A confirmed question offers no confirm button.
    expect(
      within(questionCard(1)).queryByRole("button", { name: "Confirmă răspunsul" }),
    ).toBeNull();
  });

  it('"Confirmă toate" confirms every pending question at once and enables Publish', async () => {
    fakeServer(
      testMaterial({
        questions: [confirmed(mcq("q1")), shortQuestion("q2"), programmingQuestion("q3")],
      }),
    );
    renderScreen(
      testMaterial({
        questions: [confirmed(mcq("q1")), shortQuestion("q2"), programmingQuestion("q3")],
      }),
    );
    expect(publishButton().disabled).toBe(true);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirmă toate răspunsurile" }));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    expect(mocks.confirmQuestions).toHaveBeenCalledWith(testMaterial().id, ["q2", "q3"]);
  });

  it("is enabled straight away when everything is already confirmed", () => {
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );
    expect(publishButton().disabled).toBe(false);
  });

  it("is enabled for a lesson with no check questions (nothing to confirm)", () => {
    renderScreen(lessonMaterial([]));
    expect(publishButton().disabled).toBe(false);
  });

  it("is disabled again as soon as there are unsaved edits, even if all answers were confirmed", async () => {
    fakeServer(testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }));
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );
    expect(publishButton().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Titlu"), { target: { value: "Titlu modificat" } });
    expect(publishButton().disabled).toBe(true);
    expect(screen.getByText("Salvează modificările înainte de a publica.")).not.toBeNull();

    await userEvent.setup().click(saveButton());
    await waitFor(() => expect(publishButton().disabled).toBe(false));
  });

  it("editing a confirmed question and saving puts it back to unconfirmed, which blocks Publish again", async () => {
    fakeServer(testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }));
    const u = userEvent.setup();
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );

    fireEvent.change(within(questionCard(1)).getByLabelText("Enunț (Markdown)"), {
      target: { value: "Enunț schimbat" },
    });
    await u.click(saveButton());

    await waitFor(() => expect(within(questionCard(1)).getByText("Neconfirmat")).not.toBeNull());
    expect(within(questionCard(2)).getByText("Confirmat")).not.toBeNull(); // untouched: still confirmed
    expect(publishButton().disabled).toBe(true);
    expect(screen.getByText(/Neconfirmate: Întrebarea 1\./)).not.toBeNull();
  });

  it("does not let a question be confirmed while there are unsaved edits", () => {
    fakeServer(testMaterial());
    renderScreen(testMaterial());
    fireEvent.change(screen.getByLabelText("Titlu"), { target: { value: "x" } });
    expect(confirmButtonOf(1).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Confirmă toate răspunsurile" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText("Salvează modificările înainte de a confirma răspunsurile."),
    ).not.toBeNull();
  });
});

describe("publishing", () => {
  it("publishes, then shows the read-only material with the assign and new-version tools", async () => {
    fakeServer(testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }));
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );

    await userEvent.setup().click(publishButton());

    expect(await screen.findByRole("button", { name: "Creează o versiune nouă" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Atribuie claselor" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Publică materialul" })).toBeNull();
    expect(screen.queryByLabelText("Titlu")).toBeNull(); // no editor any more
    expect(screen.getByText("Publicat")).not.toBeNull();
  });

  it("when the server still refuses (a race), shows the unconfirmed questions it lists, in Romanian", async () => {
    const server = fakeServer(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );
    // Behind the page's back, question 2 stops being confirmed.
    server.mutate((m) => {
      if (m.questions?.[1]) m.questions[1].verification = "unchecked";
    });

    await userEvent.setup().click(publishButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Confirmă răspunsurile corecte ale tuturor întrebărilor înainte de publicare.",
    );
    expect(alert.textContent).toContain("Neconfirmate: Întrebarea 2.");
    // The screen re-reads the material, so the badge now matches the server.
    await waitFor(() => expect(within(questionCard(2)).getByText("Neconfirmat")).not.toBeNull());
    expect(mocks.getMaterial).toHaveBeenCalled();
    expect(publishButton().disabled).toBe(true);
  });

  it("shows other publish failures in Romanian without crashing", async () => {
    fakeServer(testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }));
    renderScreen(
      testMaterial({ questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))] }),
    );
    mocks.publishMaterial.mockRejectedValue(new ApiError(0, "NETWORK_ERROR"));
    await userEvent.setup().click(publishButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    expect(publishButton().disabled).toBe(false); // the teacher can try again
  });
});

describe("editing and saving", () => {
  it("sends only title and questions for a test, and shows the saved confirmation", async () => {
    fakeServer(testMaterial());
    renderScreen(testMaterial());
    expect(saveButton().disabled).toBe(true); // nothing to save yet

    fireEvent.change(screen.getByLabelText("Titlu"), { target: { value: "  Un titlu nou  " } });
    await userEvent.setup().click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const [id, patch] = mocks.updateMaterial.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(testMaterial().id);
    expect(Object.keys(patch).sort()).toEqual(["questions", "title"]);
    expect(patch.title).toBe("Un titlu nou"); // normalized by the shared schema
    expect(await screen.findByText(/Modificările au fost salvate/)).not.toBeNull();
    expect(saveButton().disabled).toBe(true);
  });

  it("for a lesson sends the title and the lesson (body, examples, check questions)", async () => {
    fakeServer(lessonMaterial());
    renderScreen(lessonMaterial());
    fireEvent.change(screen.getByLabelText("Textul lecției (Markdown)"), {
      target: { value: "# Nou\n\nText nou." },
    });
    await userEvent.setup().click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const patch = mocks.updateMaterial.mock.calls[0]?.[1] as {
      lesson: { body: string; examples: unknown[]; checkQuestions: unknown[] };
    };
    expect(Object.keys(patch).sort()).toEqual(["lesson", "title"]);
    expect(patch.lesson.body).toBe("# Nou\n\nText nou.");
    expect(patch.lesson.examples).toHaveLength(1);
    expect(patch.lesson.checkQuestions).toHaveLength(1);
  });

  it("validates with the shared schema before sending: an mcq without a correct answer is not saved", async () => {
    fakeServer(testMaterial());
    renderScreen(testMaterial());
    fireEvent.click(within(questionCard(1)).getByLabelText("Opțiunea A este corectă")); // un-tick the only correct one
    await userEvent.setup().click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Întrebarea 1 are nevoie de cel puțin un răspuns corect bifat.",
    );
    expect(mocks.updateMaterial).not.toHaveBeenCalled();
  });

  it("explains an empty prompt, an empty option and a missing accepted answer in Romanian", async () => {
    fakeServer(testMaterial());
    renderScreen(testMaterial());
    fireEvent.change(within(questionCard(1)).getByLabelText("Enunț (Markdown)"), {
      target: { value: "" },
    });
    fireEvent.change(within(questionCard(1)).getByLabelText("Textul opțiunii B"), {
      target: { value: "" },
    });
    fireEvent.change(
      within(questionCard(2)).getByLabelText("Răspunsuri acceptate (unul pe linie)"),
      { target: { value: "" } },
    );
    await userEvent.setup().click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Întrebarea 1: Enunțul nu poate fi gol.");
    expect(alert.textContent).toContain("Întrebarea 1: Textul unei opțiuni nu poate fi gol.");
    expect(alert.textContent).toContain(
      "Întrebarea 2 are nevoie de cel puțin un răspuns acceptat.",
    );
    expect(mocks.updateMaterial).not.toHaveBeenCalled();
  });

  it("shows a save failure from the server in Romanian and keeps the edits", async () => {
    fakeServer(testMaterial());
    mocks.updateMaterial.mockRejectedValue(new ApiError(409, "MATERIAL_CHANGED"));
    renderScreen(testMaterial());
    fireEvent.change(screen.getByLabelText("Titlu"), { target: { value: "Titlu păstrat" } });
    await userEvent.setup().click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Materialul a fost modificat între timp",
    );
    expect((screen.getByLabelText("Titlu") as HTMLInputElement).value).toBe("Titlu păstrat");
  });

  it("edits mcq options: add, remove (never below 2), mark correct", async () => {
    fakeServer(testMaterial());
    const u = userEvent.setup();
    renderScreen(testMaterial());
    const card = () => questionCard(1);

    expect(
      within(card()).getByRole("button", { name: "Șterge opțiunea A" }).hasAttribute("disabled"),
    ).toBe(true); // only 2 options
    await u.click(within(card()).getByRole("button", { name: "Adaugă opțiune" }));
    expect(within(card()).getByLabelText("Textul opțiunii C")).not.toBeNull();
    await u.type(within(card()).getByLabelText("Textul opțiunii C"), "A treia");
    await u.click(within(card()).getByLabelText("Opțiunea C este corectă"));
    await u.click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const saved = (mocks.updateMaterial.mock.calls[0]?.[1] as { questions: Question[] })
      .questions[0];
    expect(saved?.options?.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(saved?.options?.[2]?.text).toBe("A treia");
    expect(saved?.correct).toEqual(["a", "c"]);

    await u.click(within(card()).getByRole("button", { name: "Șterge opțiunea C" }));
    expect(within(card()).queryByLabelText("Textul opțiunii C")).toBeNull();
  });

  it("lets the teacher type several accepted answers, one per line", async () => {
    fakeServer(testMaterial());
    const u = userEvent.setup();
    renderScreen(testMaterial());
    const box = within(questionCard(2)).getByLabelText("Răspunsuri acceptate (unul pe linie)");
    await u.clear(box);
    await u.type(box, "while{Enter}WHILE{Enter}buclă while");
    await u.click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const saved = (mocks.updateMaterial.mock.calls[0]?.[1] as { questions: Question[] })
      .questions[1];
    expect(saved?.acceptedAnswers).toEqual(["while", "WHILE", "buclă while"]);
  });

  it("edits a programming question's solution, rubric and explanation", async () => {
    fakeServer(testMaterial({ questions: [programmingQuestion("q1")] }));
    renderScreen(testMaterial({ questions: [programmingQuestion("q1")] }));
    fireEvent.change(within(questionCard(1)).getByLabelText("Soluție de referință"), {
      target: { value: "print('ok')" },
    });
    fireEvent.change(within(questionCard(1)).getByLabelText("Barem"), {
      target: { value: "Afișează ok" },
    });
    await userEvent.setup().click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const saved = (mocks.updateMaterial.mock.calls[0]?.[1] as { questions: Question[] })
      .questions[0];
    expect(saved).toMatchObject({ referenceSolution: "print('ok')", rubric: "Afișează ok" });
  });
});

/** A promise the test settles by hand, to hold a request "in flight". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("requests in flight", () => {
  const titleInput = () => screen.getByLabelText("Titlu") as HTMLInputElement;
  // A fieldset-disabled input matches :disabled even though its own `disabled` property is false.
  const isLocked = (element: HTMLElement) => element.matches(":disabled");

  it("locks the inputs and Save while a save runs, so nothing typed can be lost", async () => {
    const server = fakeServer(testMaterial());
    const held = deferred<TeacherMaterial>();
    mocks.updateMaterial.mockImplementationOnce(() => held.promise);
    renderScreen(testMaterial());
    fireEvent.change(titleInput(), { target: { value: "Titlu nou" } });
    await userEvent.setup().click(saveButton());

    await waitFor(() => expect(isLocked(titleInput())).toBe(true));
    expect(
      (screen.getByRole("button", { name: "Se salvează…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(isLocked(within(questionCard(1)).getByLabelText("Enunț (Markdown)"))).toBe(true);
    expect(publishButton().disabled).toBe(true);

    held.resolve({ ...server.get(), title: "Titlu nou" });
    await waitFor(() => expect(isLocked(titleInput())).toBe(false));
    expect(titleInput().value).toBe("Titlu nou");
  });

  it("locks the inputs while a confirmation runs", async () => {
    fakeServer(testMaterial());
    const held = deferred<TeacherMaterial>();
    mocks.confirmQuestions.mockImplementationOnce(() => held.promise);
    renderScreen(testMaterial());
    await userEvent.setup().click(confirmButtonOf(1));

    await waitFor(() => expect(isLocked(titleInput())).toBe(true));
    held.resolve(confirmedFirstOf(testMaterial()));
    await waitFor(() => expect(isLocked(titleInput())).toBe(false));
  });

  it("locks the inputs while publishing runs", async () => {
    const material = testMaterial({
      questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))],
    });
    fakeServer(material);
    const held = deferred<TeacherMaterial>();
    mocks.publishMaterial.mockImplementationOnce(() => held.promise);
    renderScreen(material);
    await userEvent.setup().click(publishButton());

    await waitFor(() => expect(isLocked(titleInput())).toBe(true));
    held.resolve({ ...material, status: "published", publishedAt: "2026-10-18T10:00:00.000Z" });
    expect(await screen.findByRole("button", { name: "Creează o versiune nouă" })).not.toBeNull();
  });

  it("shows an edited confirmed question as unconfirmed until it is saved", async () => {
    const material = testMaterial({
      questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))],
    });
    fakeServer(material);
    renderScreen(material);
    expect(within(questionCard(1)).getByText("Confirmat")).not.toBeNull();

    fireEvent.change(within(questionCard(1)).getByLabelText("Enunț (Markdown)"), {
      target: { value: "Enunț modificat" },
    });

    expect(within(questionCard(1)).getByText("Neconfirmat")).not.toBeNull();
    expect(within(questionCard(2)).getByText("Confirmat")).not.toBeNull(); // untouched
    expect(publishButton().disabled).toBe(true);
  });

  it("sends a cleared explanation as absent, not as an empty string", async () => {
    fakeServer(testMaterial());
    renderScreen(testMaterial());
    fireEvent.change(within(questionCard(1)).getByLabelText("Explicație (Markdown)"), {
      target: { value: "" },
    });
    await userEvent.setup().click(saveButton());

    await waitFor(() => expect(mocks.updateMaterial).toHaveBeenCalledTimes(1));
    const sent = (mocks.updateMaterial.mock.calls[0]?.[1] as { questions: Question[] })
      .questions[0];
    expect(sent?.explanation).toBeUndefined();
  });

  it("shows a failed confirmation in Romanian and keeps the question editable", async () => {
    fakeServer(testMaterial());
    mocks.confirmQuestions.mockRejectedValue(new ApiError(0, "NETWORK_ERROR"));
    renderScreen(testMaterial());
    await userEvent.setup().click(confirmButtonOf(1));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    expect(isLocked(titleInput())).toBe(false);
    expect(confirmButtonOf(1).disabled).toBe(false);
  });

  it("shows UNKNOWN_QUESTIONS from the server in Romanian", async () => {
    fakeServer(testMaterial());
    mocks.confirmQuestions.mockRejectedValue(new ApiError(404, "UNKNOWN_QUESTIONS"));
    renderScreen(testMaterial());
    await userEvent.setup().click(confirmButtonOf(1));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unele întrebări nu există în material.",
    );
  });
});

function confirmedFirstOf(material: TeacherMaterial): TeacherMaterial {
  return {
    ...material,
    questions: material.questions?.map((q, i) => (i === 0 ? confirmed(q) : q)),
  };
}

describe("read-only published material", () => {
  const published = () =>
    testMaterial({
      status: "published",
      publishedAt: "2026-10-18T10:00:00.000Z",
      questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))],
    });

  it("has no editing controls and shows the answer key to the teacher", () => {
    renderScreen(published());
    expect(screen.queryByLabelText("Titlu")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvează modificările" })).toBeNull();
    expect(screen.getByText("(corect)")).not.toBeNull();
    expect(screen.getByText("while")).not.toBeNull();
  });

  it("creates a new version and goes to it", async () => {
    const draft = testMaterial({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      version: 2,
      parentId: published().id,
    });
    mocks.createNewVersion.mockResolvedValue(draft);
    const navigated: string[] = [];
    render(
      <MemoryRouter>
        <MaterialScreen initial={published()} />
        <Spy onPath={(path) => navigated.push(path)} />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Creează o versiune nouă" }));
    await waitFor(() => expect(navigated.at(-1)).toBe(`/teacher/materials/${draft.id}`));
    expect(mocks.createNewVersion).toHaveBeenCalledWith(published().id);
  });

  it("shows a failure to create a new version in Romanian", async () => {
    mocks.createNewVersion.mockRejectedValue(new ApiError(409, "VERSION_EXISTS"));
    renderScreen(published());
    await userEvent.setup().click(screen.getByRole("button", { name: "Creează o versiune nouă" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Există deja o versiune nouă a acestui material.",
    );
  });

  it("links a later version back to the one it came from", () => {
    renderScreen({ ...published(), parentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(screen.getByRole("link", { name: "versiunea anterioară" }).getAttribute("href")).toBe(
      "/teacher/materials/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
  });

  it("an archived material is read-only with no assign or new-version tools", () => {
    renderScreen({ ...published(), status: "archived" });
    expect(screen.queryByRole("button", { name: "Creează o versiune nouă" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Atribuie claselor" })).toBeNull();
  });
});

describe("assigning a published material", () => {
  const published = () =>
    testMaterial({
      status: "published",
      questions: [confirmed(mcq("q1")), confirmed(shortQuestion("q2"))],
    });
  const cls = (id: string, name: string, grade = 9) => ({
    id,
    name,
    grade,
    join_code: "ABC234",
    style_notes: null,
    created_at: "2026-10-17T10:00:00.000Z",
  });

  it("assigns to the selected classes only", async () => {
    mocks.listClasses.mockResolvedValue([cls("c1", "9A"), cls("c2", "9B", 10), cls("c3", "9C")]);
    mocks.assignMaterial.mockResolvedValue({ materialId: published().id, classIds: ["c1", "c3"] });
    const u = userEvent.setup();
    renderScreen(published());

    const button = await screen.findByRole("button", { name: "Atribuie materialul" });
    expect((button as HTMLButtonElement).disabled).toBe(true); // nothing selected
    await u.click(screen.getByLabelText(/9A/));
    await u.click(screen.getByLabelText(/9C/));
    await u.click(button);

    await waitFor(() =>
      expect(mocks.assignMaterial).toHaveBeenCalledWith(published().id, ["c1", "c3"]),
    );
    expect((await screen.findByRole("status")).textContent).toBe(
      "Materialul a fost atribuit la 2 clase.",
    );
  });

  it("shows a refusal in Romanian (e.g. a class that is not the teacher's)", async () => {
    mocks.listClasses.mockResolvedValue([cls("c1", "9A")]);
    mocks.assignMaterial.mockRejectedValue(new ApiError(404, "CLASS_NOT_FOUND"));
    const u = userEvent.setup();
    renderScreen(published());
    await u.click(await screen.findByLabelText(/9A/));
    await u.click(screen.getByRole("button", { name: "Atribuie materialul" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Clasa nu a fost găsită.");
  });

  it("shows empty and error states for the class list", async () => {
    mocks.listClasses.mockResolvedValueOnce([]);
    const { unmount } = renderScreen(published());
    expect(await screen.findByText(/Nu ai nicio clasă/)).not.toBeNull();
    unmount();

    mocks.listClasses.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR"));
    renderScreen(published());
    expect((await screen.findByRole("alert")).textContent).toContain("A apărut o eroare internă");
  });
});

describe("lesson display", () => {
  it("renders the AI-written lesson body as safe markdown in the read-only view", () => {
    renderScreen(
      lessonMaterial([confirmed(mcq("q1"))], {
        status: "published",
        lesson: {
          body: 'Text <script>window.pwned = 1</script> și <img src=x onerror="window.pwned = 2"> [clic](javascript:alert(1))\n\n<div onclick="x()">c</div>',
          examples: [],
          checkQuestions: [confirmed(mcq("q1"))],
        },
      }),
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("a[href^='javascript']")).toBeNull();
    expect(
      [...document.querySelectorAll("*")].some((el) =>
        [...el.attributes].some((a) => a.name.startsWith("on")),
      ),
    ).toBe(false);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it("also sanitizes the live preview and the prompts and explanations shown to the teacher", async () => {
    const dangerous = '<script>window.pwned = 3</script><b onclick="x()">negru</b>';
    renderScreen(
      lessonMaterial([mcq("q1", { prompt: dangerous, explanation: dangerous })], {
        lesson: {
          body: dangerous,
          examples: [],
          checkQuestions: [mcq("q1", { prompt: dangerous, explanation: dangerous })],
        },
      }),
    );
    expect(document.querySelector("script")).toBeNull();
    expect(
      [...document.querySelectorAll("*")].some((el) =>
        [...el.attributes].some((a) => a.name.startsWith("on")),
      ),
    ).toBe(false);
  });
});

/** Records the router location so a test can see where the app navigated. */
import { useLocation } from "react-router";
import { useEffect } from "react";
function Spy({ onPath }: { onPath: (path: string) => void }) {
  const location = useLocation();
  useEffect(() => {
    // A block body: an effect must not return a value (React would call it as a cleanup).
    onPath(location.pathname);
  }, [location.pathname, onPath]);
  return null;
}
