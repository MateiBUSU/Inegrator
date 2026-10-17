// @vitest-environment jsdom
import type { StudentClass, TeacherClass } from "@app/shared";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { renderAt, studentUser, teacherUser } from "../test/render";
import { StudentClassesPage } from "./student-classes-page";
import { TeacherClassesPage } from "./teacher-classes-page";

const mocks = vi.hoisted(() => ({
  listClasses: vi.fn(),
  createClass: vi.fn(),
  joinClass: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: {
      classes: {
        listClasses: mocks.listClasses,
        createClass: mocks.createClass,
        joinClass: mocks.joinClass,
      },
    },
  };
});

const teacherClass = (over: Partial<TeacherClass> = {}): TeacherClass => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "9A",
  grade: 9,
  join_code: "ABC234",
  created_at: "2026-10-17T10:00:00.000Z",
  ...over,
});
const studentClass = (over: Partial<StudentClass> = {}): StudentClass => ({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "10B",
  grade: 10,
  teacher_display_name: "Prof Test",
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("teacher class list", () => {
  beforeEach(() => {
    mocks.listClasses.mockResolvedValue([]);
  });

  it("shows a loading state first, then the classes with their join codes and links", async () => {
    let resolve: (value: TeacherClass[]) => void = () => undefined;
    mocks.listClasses.mockReturnValue(new Promise<TeacherClass[]>((r) => (resolve = r)));
    renderAt(<TeacherClassesPage />, { auth: { user: teacherUser } });

    expect(screen.getByRole("status").textContent).toBe("Se încarcă clasele…");
    resolve([
      teacherClass(),
      teacherClass({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "11C",
        grade: 11,
        join_code: "XYZ789",
      }),
    ]);

    expect(await screen.findByRole("link", { name: "9A" })).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("link", { name: "9A" }).getAttribute("href")).toBe(
      "/teacher/classes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(screen.getByText("ABC234")).not.toBeNull();
    expect(screen.getByText("XYZ789")).not.toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledWith("teacher");
  });

  it("shows an empty state when the teacher has no classes", async () => {
    renderAt(<TeacherClassesPage />, { auth: { user: teacherUser } });
    expect(await screen.findByText(/Nu ai creat nicio clasă încă/)).not.toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows a Romanian error state and retries on request", async () => {
    mocks.listClasses.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"));
    mocks.listClasses.mockResolvedValueOnce([teacherClass()]);
    renderAt(<TeacherClassesPage />, { auth: { user: teacherUser } });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));

    expect(await screen.findByRole("link", { name: "9A" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledTimes(2);
  });

  it("creates a class and reloads the list", async () => {
    mocks.listClasses
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([teacherClass({ name: "12D", grade: 12 })]);
    mocks.createClass.mockResolvedValue(teacherClass());
    const u = userEvent.setup();
    renderAt(<TeacherClassesPage />, { auth: { user: teacherUser } });
    await screen.findByText(/Nu ai creat nicio clasă încă/);

    await u.type(screen.getByLabelText("Numele clasei"), "  12D  ");
    await u.selectOptions(screen.getByLabelText("Clasa"), "12");
    await u.click(screen.getByRole("button", { name: "Creează clasa" }));

    await waitFor(() => expect(mocks.createClass).toHaveBeenCalledWith({ name: "12D", grade: 12 }));
    expect(await screen.findByRole("link", { name: "12D" })).not.toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Numele clasei") as HTMLInputElement).value).toBe("");
  });

  it("validates the class name in Romanian and shows API errors", async () => {
    const u = userEvent.setup();
    renderAt(<TeacherClassesPage />, { auth: { user: teacherUser } });
    await screen.findByText(/Nu ai creat nicio clasă încă/);

    await u.click(screen.getByRole("button", { name: "Creează clasa" }));
    expect(await screen.findByText("Introdu numele clasei.")).not.toBeNull();
    expect(mocks.createClass).not.toHaveBeenCalled();

    mocks.createClass.mockRejectedValue(new ApiError(503, "JOIN_CODE_UNAVAILABLE"));
    await u.type(screen.getByLabelText("Numele clasei"), "9A");
    await u.click(screen.getByRole("button", { name: "Creează clasa" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nu s-a putut genera un cod de clasă. Încearcă din nou.",
    );
  });
});

describe("student class list", () => {
  beforeEach(() => {
    mocks.listClasses.mockResolvedValue([]);
  });

  it("shows the enrolled classes with the teacher's display name, never a join code", async () => {
    mocks.listClasses.mockResolvedValue([studentClass()]);
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });

    expect(await screen.findByRole("link", { name: "10B" })).not.toBeNull();
    expect(screen.getByText("Profesor: Prof Test")).not.toBeNull();
    expect(screen.getByRole("link", { name: "10B" }).getAttribute("href")).toBe(
      "/student/classes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(screen.queryByText(/Cod de alăturare/)).toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledWith("student");
  });

  it("shows loading, then an empty state that tells the student to use the class code", async () => {
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });
    expect(screen.getByRole("status").textContent).toBe("Se încarcă clasele…");
    expect(await screen.findByText(/Nu faci parte din nicio clasă încă/)).not.toBeNull();
  });

  it("shows a Romanian error state for a failed load", async () => {
    mocks.listClasses.mockRejectedValue(new ApiError(500, "INTERNAL_ERROR"));
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });
    expect((await screen.findByRole("alert")).textContent).toContain("A apărut o eroare internă");
  });

  it("joins a class with a code and reloads the list", async () => {
    mocks.listClasses.mockResolvedValueOnce([]).mockResolvedValueOnce([studentClass()]);
    mocks.joinClass.mockResolvedValue(studentClass());
    const u = userEvent.setup();
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });
    await screen.findByText(/Nu faci parte din nicio clasă încă/);

    await u.type(screen.getByLabelText("Codul clasei"), "  abc234  ");
    await u.click(screen.getByRole("button", { name: "Intră în clasă" }));

    await waitFor(() => expect(mocks.joinClass).toHaveBeenCalledWith("abc234"));
    expect(await screen.findByRole("link", { name: "10B" })).not.toBeNull();
    expect((screen.getByLabelText("Codul clasei") as HTMLInputElement).value).toBe("");
  });

  it("rejects a code with spaces or symbols in Romanian before calling the API", async () => {
    const u = userEvent.setup();
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });
    await screen.findByText(/Nu faci parte din nicio clasă încă/);
    await u.type(screen.getByLabelText("Codul clasei"), "AB-CD 12");
    await u.click(screen.getByRole("button", { name: "Intră în clasă" }));
    expect(await screen.findByText("Codul clasei conține doar litere și cifre.")).not.toBeNull();
    expect(mocks.joinClass).not.toHaveBeenCalled();
  });

  it("validates the code in Romanian and shows the API's unknown-code error", async () => {
    const u = userEvent.setup();
    renderAt(<StudentClassesPage />, { auth: { user: studentUser } });
    await screen.findByText(/Nu faci parte din nicio clasă încă/);

    await u.click(screen.getByRole("button", { name: "Intră în clasă" }));
    expect(await screen.findByText("Introdu codul clasei.")).not.toBeNull();
    expect(mocks.joinClass).not.toHaveBeenCalled();

    mocks.joinClass.mockRejectedValue(new ApiError(404, "INVALID_JOIN_CODE"));
    await u.type(screen.getByLabelText("Codul clasei"), "ZZZZZZ");
    await u.click(screen.getByRole("button", { name: "Intră în clasă" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Codul de clasă nu este valid.");
  });
});
