// @vitest-environment jsdom
import type { StudentProgressResponse } from "@app/shared";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { classDetail, confirmed, mcq, STUDENT, summary, testMaterial } from "../test/fixtures";
import { TeacherClassDetailPage } from "./teacher-class-detail-page";
import { TeacherMaterialPage } from "./teacher-material-page";
import { TeacherMaterialsPage } from "./teacher-materials-page";
import { TeacherStudentProgressPage } from "./teacher-student-progress-page";

const mocks = vi.hoisted(() => ({
  getClass: vi.fn(),
  getStudentProgress: vi.fn(),
  listMaterials: vi.fn(),
  getMaterial: vi.fn(),
  listDocuments: vi.fn(),
  updateStyleNotes: vi.fn(),
  extractStyleNotes: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  createNewVersion: vi.fn(),
  listClasses: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      classes: {
        getClass: mocks.getClass,
        getStudentProgress: mocks.getStudentProgress,
        listClasses: mocks.listClasses,
      },
      materials: {
        listMaterials: mocks.listMaterials,
        getMaterial: mocks.getMaterial,
        createNewVersion: mocks.createNewVersion,
      },
      documents: {
        listDocuments: mocks.listDocuments,
        updateStyleNotes: mocks.updateStyleNotes,
        extractStyleNotes: mocks.extractStyleNotes,
        createDocument: mocks.createDocument,
        deleteDocument: mocks.deleteDocument,
      },
    },
  };
});

const CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        <Route
          path="/teacher/classes/:id/students/:studentId"
          element={<TeacherStudentProgressPage />}
        />
        <Route path="/teacher/materials" element={<TeacherMaterialsPage />} />
        <Route path="/teacher/materials/new" element={<p>GENERATE PAGE</p>} />
        <Route path="/teacher/materials/:id" element={<TeacherMaterialPage />} />
        <Route path="/teacher/classes" element={<p>CLASSES LIST</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.listDocuments.mockResolvedValue([]);
  mocks.listMaterials.mockResolvedValue([]);
  mocks.listClasses.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("class detail page", () => {
  it("shows the class info, the students with progress links, the style notes and the documents", async () => {
    mocks.getClass.mockResolvedValue(classDetail({ style_notes: "Ton prietenos." }));
    mocks.listDocuments.mockResolvedValue([
      { id: "d1", title: "Curs bucle", chunk_count: 5, created_at: "2026-10-17T10:00:00.000Z" },
    ]);
    renderAt(`/teacher/classes/${CLASS_ID}`);

    expect(await screen.findByRole("heading", { name: "9A" })).not.toBeNull();
    expect(screen.getByText("clasa a IX-a")).not.toBeNull();
    expect(screen.getByText("ABC234")).not.toBeNull();
    expect(mocks.getClass).toHaveBeenCalledWith("teacher", CLASS_ID);

    const students = screen.getByRole("region", { name: "Elevi" });
    expect(within(students).getByText("Maria")).not.toBeNull();
    expect(
      within(students).getByRole("link", { name: "Vezi progresul" }).getAttribute("href"),
    ).toBe(`/teacher/classes/${CLASS_ID}/students/${STUDENT.id}`);

    expect((screen.getByLabelText("Notițe de stil") as HTMLTextAreaElement).value).toBe(
      "Ton prietenos.",
    );
    expect(await screen.findByText("Curs bucle")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sugerează din documente" })).not.toBeNull();
  });

  it("explains how students can join when nobody has yet", async () => {
    mocks.getClass.mockResolvedValue(classDetail({ students: [] }));
    renderAt(`/teacher/classes/${CLASS_ID}`);
    expect(
      await screen.findByText("Niciun elev nu s-a alăturat încă. Dă-le codul clasei: ABC234."),
    ).not.toBeNull();
  });

  it("shows a loading state, and a Romanian error with retry when the class cannot be shown", async () => {
    mocks.getClass
      .mockRejectedValueOnce(new ApiError(404, "CLASS_NOT_FOUND"))
      .mockResolvedValueOnce(classDetail());
    renderAt(`/teacher/classes/${CLASS_ID}`);
    expect(screen.getByText("Se încarcă clasa…")).not.toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("Clasa nu a fost găsită.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByRole("heading", { name: "9A" })).not.toBeNull();
  });
});

describe("student progress page", () => {
  const progress = (over: Partial<StudentProgressResponse> = {}): StudentProgressResponse => ({
    student: { id: STUDENT.id, display_name: "Maria" },
    lesson_progress: [],
    quiz_attempts: [],
    ...over,
  });
  const path = `/teacher/classes/${CLASS_ID}/students/${STUDENT.id}`;
  const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("renders lesson progress and quiz attempts with the materials' titles", async () => {
    mocks.getStudentProgress.mockResolvedValue(
      progress({
        lesson_progress: [
          { material_id: M1, status: "completed", updated_at: "2026-10-18T10:00:00.000Z" },
        ],
        quiz_attempts: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            material_id: M1,
            score: 7,
            max_score: 10,
            submitted_at: "2026-10-18T11:00:00.000Z",
          },
        ],
      }),
    );
    mocks.listMaterials.mockResolvedValue([summary({ id: M1, title: "Test bucle" })]);
    renderAt(path);

    expect(await screen.findByRole("heading", { name: "Progres: Maria" })).not.toBeNull();
    expect(mocks.getStudentProgress).toHaveBeenCalledWith(CLASS_ID, STUDENT.id);
    const lessons = screen.getByRole("region", { name: "Lecții" });
    await waitFor(() => expect(within(lessons).getByText("Test bucle")).not.toBeNull());
    expect(within(lessons).getByText(/Terminat/)).not.toBeNull();
    const tests = screen.getByRole("region", { name: "Teste" });
    expect(within(tests).getByText(/7 \/ 10 puncte/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "← Înapoi la clasă" }).getAttribute("href")).toBe(
      `/teacher/classes/${CLASS_ID}`,
    );
  });

  it("falls back to a short id when a material's title is not known", async () => {
    mocks.getStudentProgress.mockResolvedValue(
      progress({
        lesson_progress: [
          { material_id: M1, status: "started", updated_at: "2026-10-18T10:00:00.000Z" },
        ],
      }),
    );
    renderAt(path);
    expect(await screen.findByText("Material aaaaaaaa")).not.toBeNull();
    expect(screen.getByText(/Început/)).not.toBeNull();
  });

  it("shows an empty state when there is no activity yet", async () => {
    mocks.getStudentProgress.mockResolvedValue(progress());
    renderAt(path);
    expect(await screen.findByText(/nicio activitate înregistrată/)).not.toBeNull();
  });

  it("shows a Romanian error (e.g. a student who is not in the class) with a way back", async () => {
    mocks.getStudentProgress.mockRejectedValue(new ApiError(404, "STUDENT_NOT_FOUND"));
    renderAt(path);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Elevul nu face parte din această clasă.",
    );
    expect(screen.getByRole("link", { name: "← Înapoi la clasă" })).not.toBeNull();
  });
});

describe("materials list page", () => {
  it("lists materials with kind, grade, version and status, each linking to its editor", async () => {
    mocks.listMaterials.mockResolvedValue([
      summary({ id: "m1", title: "Test bucle", status: "draft" }),
      summary({
        id: "m2",
        title: "Lecție funcții",
        kind: "lesson",
        status: "published",
        version: 2,
        publishedAt: "2026-10-18T10:00:00.000Z",
      }),
    ]);
    renderAt("/teacher/materials");

    expect(await screen.findByRole("link", { name: "Test bucle" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Test bucle" }).getAttribute("href")).toBe(
      "/teacher/materials/m1",
    );
    expect(screen.getByRole("link", { name: "Lecție funcții" }).getAttribute("href")).toBe(
      "/teacher/materials/m2",
    );
    expect(document.querySelector(".badge-draft")?.textContent).toBe("Ciornă"); // (the filter also lists the word)
    expect(document.querySelector(".badge-published")?.textContent).toBe("Publicat");
    expect(screen.getByRole("link", { name: "Generează un material" }).getAttribute("href")).toBe(
      "/teacher/materials/new",
    );
    expect(mocks.listMaterials).toHaveBeenCalledWith(undefined); // no filter = all
  });

  it("filters by status through the API", async () => {
    const u = userEvent.setup();
    renderAt("/teacher/materials");
    await screen.findByText(/Nu ai niciun material încă/);

    for (const [label, status] of [
      ["Publicat", "published"],
      ["Ciornă", "draft"],
      ["Arhivat", "archived"],
    ] as const) {
      await u.selectOptions(screen.getByLabelText("Stare"), label);
      await waitFor(() => expect(mocks.listMaterials).toHaveBeenLastCalledWith(status));
    }
    await u.selectOptions(screen.getByLabelText("Stare"), "Toate");
    await waitFor(() => expect(mocks.listMaterials).toHaveBeenLastCalledWith(undefined));
  });

  it("shows an empty state that names the active filter", async () => {
    const u = userEvent.setup();
    renderAt("/teacher/materials");
    expect(
      await screen.findByText("Nu ai niciun material încă. Generează primul material."),
    ).not.toBeNull();
    await u.selectOptions(screen.getByLabelText("Stare"), "Arhivat");
    expect(await screen.findByText("Nu ai materiale cu starea „Arhivat”.")).not.toBeNull();
  });

  it("shows loading and a retryable Romanian error", async () => {
    mocks.listMaterials
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"))
      .mockResolvedValueOnce([summary()]);
    renderAt("/teacher/materials");
    expect(screen.getByText("Se încarcă materialele…")).not.toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByRole("link", { name: "Test bucle" })).not.toBeNull();
  });
});

describe("material page", () => {
  const M = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("loads the material into the editor (a draft) and shows loading first", async () => {
    mocks.getMaterial.mockResolvedValue(testMaterial());
    renderAt(`/teacher/materials/${M}`);
    expect(screen.getByText("Se încarcă materialul…")).not.toBeNull();
    expect(await screen.findByLabelText("Titlu")).not.toBeNull();
    expect(mocks.getMaterial).toHaveBeenCalledWith("teacher", M);
  });

  it("shows a Romanian error with retry when the material cannot be opened", async () => {
    mocks.getMaterial
      .mockRejectedValueOnce(new ApiError(404, "MATERIAL_NOT_FOUND"))
      .mockResolvedValueOnce(testMaterial());
    renderAt(`/teacher/materials/${M}`);
    expect((await screen.findByRole("alert")).textContent).toContain("Materialul nu a fost găsit.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByLabelText("Titlu")).not.toBeNull();
  });

  it("opens a new version's draft after creating it from a published material", async () => {
    const NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const published = testMaterial({ status: "published", questions: [confirmed(mcq("q1"))] });
    mocks.getMaterial.mockImplementation(async (_role: string, id: string) =>
      id === NEW
        ? testMaterial({ id: NEW, version: 2, parentId: M, title: "Versiunea 2" })
        : published,
    );
    mocks.createNewVersion.mockResolvedValue(testMaterial({ id: NEW, version: 2, parentId: M }));
    renderAt(`/teacher/materials/${M}`);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Creează o versiune nouă" }));

    expect(await screen.findByLabelText("Titlu")).not.toBeNull(); // the draft editor
    expect((screen.getByLabelText("Titlu") as HTMLInputElement).value).toBe("Versiunea 2");
    expect(mocks.getMaterial).toHaveBeenLastCalledWith("teacher", NEW);
    expect(screen.getByRole("link", { name: "versiunea anterioară" }).getAttribute("href")).toBe(
      `/teacher/materials/${M}`,
    );
  });
});
