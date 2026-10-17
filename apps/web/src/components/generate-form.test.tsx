// @vitest-environment jsdom
import type { DocumentSummary, TeacherClass } from "@app/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Subject } from "../api";
import { testMaterial } from "../test/fixtures";
import { GenerateForm } from "./generate-form";

const mocks = vi.hoisted(() => ({
  listClasses: vi.fn(),
  listSubjects: vi.fn(),
  listDocuments: vi.fn(),
  generateMaterial: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      classes: { listClasses: mocks.listClasses },
      materials: { listSubjects: mocks.listSubjects, generateMaterial: mocks.generateMaterial },
      documents: { listDocuments: mocks.listDocuments },
    },
  };
});

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLASS_9A = U(1);
const CLASS_10B = U(2);
const SUBJECT_9 = U(10);
const SUBJECT_10 = U(11);
const SUBJECT_BAC = U(12);
const CHAPTER_1 = U(20);
const OBJ_1 = U(30);
const OBJ_2 = U(31);
const DOC_A = U(40);
const DOC_B = U(41);

const cls = (id: string, name: string, grade: number): TeacherClass => ({
  id,
  name,
  grade,
  join_code: "ABC234",
  style_notes: null,
  created_at: "2026-10-17T10:00:00.000Z",
});
const subject = (
  id: string,
  title: string,
  grade: number | null,
  chapters: Subject["chapters"] = [],
): Subject => ({
  id,
  slug: title,
  title,
  section: grade === null ? "bac" : "programa",
  language: "cpp",
  grade,
  chapters,
});
const doc = (id: string, title: string): DocumentSummary => ({
  id,
  title,
  chunk_count: 2,
  created_at: "2026-10-17T10:00:00.000Z",
});

const SUBJECTS = [
  subject(SUBJECT_9, "Informatică C++ – clasa a IX-a", 9, [
    {
      id: CHAPTER_1,
      title: "Structuri de control",
      position: 1,
      objectives: [
        { id: OBJ_1, code: "CPP9-1.1", text: "Scrie bucle while" },
        { id: OBJ_2, code: "CPP9-1.2", text: "Scrie bucle for" },
      ],
    },
  ]),
  subject(SUBJECT_10, "Informatică C++ – clasa a X-a", 10),
  subject(SUBJECT_BAC, "Bacalaureat C++", null),
];

function renderForm() {
  return render(
    <MemoryRouter initialEntries={["/teacher/materials/new"]}>
      <Routes>
        <Route path="/teacher/materials/new" element={<GenerateForm />} />
        <Route path="/teacher/materials/:id" element={<p>EDITOR OPENED</p>} />
        <Route path="/teacher/materials" element={<p>MATERIALS LIST</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const optionsOf = (label: string) => [...select(label).options].map((o) => o.textContent);
const generateButton = () =>
  screen.getByRole("button", { name: /Generează materialul|Se generează/ }) as HTMLButtonElement;

/** Fills the form down to chapter + the first objective. */
async function fillBasics(u: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText("Clasa");
  await u.selectOptions(select("Clasa"), CLASS_9A);
  await u.selectOptions(select("Subiect"), SUBJECT_9);
  await u.selectOptions(select("Capitol"), CHAPTER_1);
  await u.click(screen.getByLabelText(/CPP9-1.1/));
}

beforeEach(() => {
  mocks.listClasses.mockResolvedValue([cls(CLASS_9A, "9A", 9), cls(CLASS_10B, "10B", 10)]);
  mocks.listSubjects.mockResolvedValue(SUBJECTS);
  mocks.listDocuments.mockResolvedValue([doc(DOC_A, "Curs bucle"), doc(DOC_B, "Curs funcții")]);
  mocks.generateMaterial.mockResolvedValue({
    material: testMaterial({ id: U(99) }),
    usedTeacherSource: true,
    quota: { used: 1, limit: 20 },
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("the form's choices", () => {
  it("lets the teacher choose a subject only after a class, limited to that class's grade (plus bac)", async () => {
    const u = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Clasa");
    expect(select("Subiect").disabled).toBe(true);

    await u.selectOptions(select("Clasa"), CLASS_9A);
    expect(optionsOf("Subiect")).toEqual([
      "— alege subiectul —",
      "Informatică C++ – clasa a IX-a",
      "Bacalaureat C++",
    ]);

    await u.selectOptions(select("Clasa"), CLASS_10B);
    expect(optionsOf("Subiect")).toEqual([
      "— alege subiectul —",
      "Informatică C++ – clasa a X-a",
      "Bacalaureat C++",
    ]);
  });

  it("lists the chapter's objectives with their codes, and resets dependent choices when the class changes", async () => {
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    expect((screen.getByLabelText(/CPP9-1.1/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/CPP9-1.2/)).not.toBeNull();

    await u.selectOptions(select("Clasa"), CLASS_10B);
    expect(select("Subiect").value).toBe("");
    expect(select("Capitol").value).toBe("");
    expect(screen.getByText("Alege mai întâi un capitol.")).not.toBeNull();
  });

  it("shows the question count only for kinds that have questions", async () => {
    const u = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Clasa");
    expect(screen.queryByLabelText("Număr de întrebări")).toBeNull(); // lesson is the default
    for (const kind of ["test", "problem", "exercise"]) {
      await u.selectOptions(select("Tipul materialului"), kind);
      expect(screen.getByLabelText("Număr de întrebări")).not.toBeNull();
    }
    await u.selectOptions(select("Tipul materialului"), "lesson");
    expect(screen.queryByLabelText("Număr de întrebări")).toBeNull();
  });

  it("offers the class's documents, and warns when there are none", async () => {
    const u = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Clasa");
    await u.selectOptions(select("Clasa"), CLASS_9A);
    expect(await screen.findByLabelText("Curs bucle")).not.toBeNull();
    expect(
      screen.getByText("Dacă nu bifezi nimic, se folosesc toate documentele clasei."),
    ).not.toBeNull();
    expect(mocks.listDocuments).toHaveBeenCalledWith(CLASS_9A);

    mocks.listDocuments.mockResolvedValue([]);
    await u.selectOptions(select("Clasa"), CLASS_10B);
    expect(await screen.findByText(/fără sursă de la profesor/)).not.toBeNull();
  });
});

describe("submitting", () => {
  it("generates a lesson from the chosen class, chapter and objectives, and opens it in the editor", async () => {
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.click(screen.getByLabelText(/CPP9-1.2/));
    await u.click(generateButton());

    await waitFor(() => expect(screen.getByText("EDITOR OPENED")).not.toBeNull());
    // Exactly the API's request: no documentIds (= all documents), no count for a lesson.
    expect(mocks.generateMaterial).toHaveBeenCalledWith({
      classId: CLASS_9A,
      subjectId: SUBJECT_9,
      chapterId: CHAPTER_1,
      kind: "lesson",
      objectiveIds: [OBJ_1, OBJ_2],
    });
  });

  it("sends the question count and kind for a test, and the chosen documents when some are ticked", async () => {
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.selectOptions(select("Tipul materialului"), "test");
    fireEvent.change(screen.getByLabelText("Număr de întrebări"), { target: { value: "4" } });
    await u.click(await screen.findByLabelText("Curs funcții"));
    await u.click(generateButton());

    await waitFor(() => expect(mocks.generateMaterial).toHaveBeenCalledTimes(1));
    expect(mocks.generateMaterial).toHaveBeenCalledWith({
      classId: CLASS_9A,
      subjectId: SUBJECT_9,
      chapterId: CHAPTER_1,
      kind: "test",
      objectiveIds: [OBJ_1],
      documentIds: [DOC_B],
      count: 4,
    });
  });

  it("does not call the API and lists what is missing, in Romanian", async () => {
    const u = userEvent.setup();
    renderForm();
    await screen.findByLabelText("Clasa");
    await u.click(generateButton());
    const alert = await screen.findByRole("alert");
    for (const message of [
      "Alege clasa.",
      "Alege subiectul.",
      "Alege capitolul.",
      "Alege cel puțin un obiectiv.",
    ]) {
      expect(alert.textContent).toContain(message);
    }
    expect(mocks.generateMaterial).not.toHaveBeenCalled();
  });

  it("validates the question count for non-lesson kinds", async () => {
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.selectOptions(select("Tipul materialului"), "test");
    for (const bad of ["0", "21", "", "2.5"]) {
      fireEvent.change(screen.getByLabelText("Număr de întrebări"), { target: { value: bad } });
      await u.click(generateButton());
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /Numărul de întrebări|Introdu numărul/,
      );
    }
    expect(mocks.generateMaterial).not.toHaveBeenCalled();
  });

  it("shows a progress label while generating and prevents a double submit", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.generateMaterial.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.click(generateButton());
    expect(generateButton().textContent).toContain("Se generează");
    expect(generateButton().disabled).toBe(true);
    finish({
      material: testMaterial({ id: U(99) }),
      usedTeacherSource: true,
      quota: { used: 1, limit: 20 },
    });
    await waitFor(() => expect(screen.getByText("EDITOR OPENED")).not.toBeNull());
    expect(mocks.generateMaterial).toHaveBeenCalledTimes(1);
  });
});

describe("when generation is refused (not fatal)", () => {
  it("shows the daily-quota message (429), keeps the form, and says the rest of the app works", async () => {
    mocks.generateMaterial.mockRejectedValue(new ApiError(429, "QUOTA_EXCEEDED", { limit: 20 }));
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.click(generateButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine.",
    );
    expect(screen.getByText(/Restul aplicației funcționează normal/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "lista de materiale" }).getAttribute("href")).toBe(
      "/teacher/materials",
    );
    // The form is intact and usable.
    expect(select("Capitol").value).toBe(CHAPTER_1);
    expect((screen.getByLabelText(/CPP9-1.1/) as HTMLInputElement).checked).toBe(true);
    expect(generateButton().disabled).toBe(false);
    expect(screen.queryByText("EDITOR OPENED")).toBeNull();
  });

  it("shows the AI-unavailable message (503) and lets the teacher try again successfully", async () => {
    mocks.generateMaterial.mockRejectedValueOnce(new ApiError(503, "AI_UNAVAILABLE"));
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.click(generateButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Generarea cu AI nu este disponibilă momentan. Încearcă mai târziu.",
    );

    await u.click(generateButton()); // the second attempt works (the default mock resolves)
    await waitFor(() => expect(screen.getByText("EDITOR OPENED")).not.toBeNull());
    expect(mocks.generateMaterial).toHaveBeenCalledTimes(2);
  });

  it("shows any other failure with the generic Romanian message", async () => {
    mocks.generateMaterial.mockRejectedValue(new Error("boom"));
    const u = userEvent.setup();
    renderForm();
    await fillBasics(u);
    await u.click(generateButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A apărut o eroare. Încearcă din nou.",
    );
  });
});

describe("loading, empty and error states", () => {
  it("shows a loading state first", () => {
    mocks.listClasses.mockReturnValue(new Promise(() => undefined));
    renderForm();
    expect(screen.getByRole("status").textContent).toBe("Se încarcă datele…");
  });

  it("explains that a class is needed when the teacher has none", async () => {
    mocks.listClasses.mockResolvedValue([]);
    renderForm();
    expect(await screen.findByText(/ai nevoie de o clasă/)).not.toBeNull();
  });

  it("shows a retryable error if the classes or the subjects cannot be loaded", async () => {
    mocks.listClasses.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR"));
    const { unmount } = renderForm();
    expect((await screen.findByRole("alert")).textContent).toContain("A apărut o eroare internă");
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByLabelText("Clasa")).not.toBeNull();
    unmount();

    mocks.listSubjects.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"));
    renderForm();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
  });
});
