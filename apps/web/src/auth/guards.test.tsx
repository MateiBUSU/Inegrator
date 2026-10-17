// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { renderAt, studentUser, teacherUser } from "../test/render";

// The real route table and the real guards, with a hand-made auth context. Pages that load data
// get a mocked API (no network).
const mocks = vi.hoisted(() => ({ listClasses: vi.fn(), me: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    api: { auth: { me: mocks.me }, classes: { listClasses: mocks.listClasses } },
  };
});

const PROTECTED_PATHS = [
  "/teacher/classes",
  "/teacher/classes/abc",
  "/teacher/materials",
  "/teacher/materials/abc",
  "/student/classes",
  "/student/classes/abc",
  "/student/materials/abc",
  "/student/progress",
];

const loginHeading = () => screen.queryByRole("heading", { name: "Autentifică-te în cont" });
const forbiddenHeading = () => screen.queryByRole("heading", { name: "Acces interzis" });

beforeEach(() => {
  mocks.listClasses.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("route guards: unauthenticated users", () => {
  it.each(PROTECTED_PATHS)("redirects %s to /login", (path) => {
    renderAt(<App />, { path, auth: { user: null } });
    expect(loginHeading()).not.toBeNull();
    expect(forbiddenHeading()).toBeNull();
  });

  it("does not request any data for the protected page it redirected away from", () => {
    renderAt(<App />, { path: "/teacher/classes", auth: { user: null } });
    expect(mocks.listClasses).not.toHaveBeenCalled();
  });

  it("still shows the public pages", () => {
    renderAt(<App />, { path: "/", auth: { user: null } });
    expect(screen.getByRole("heading", { name: "Informatică pentru liceu" })).not.toBeNull();
    cleanup();
    renderAt(<App />, { path: "/register", auth: { user: null } });
    expect(screen.getByRole("heading", { name: "Cum vei folosi Nexora?" })).not.toBeNull();
  });
});

describe("route guards: while the session is still loading", () => {
  it("shows a loading state instead of redirecting too early", () => {
    renderAt(<App />, { path: "/teacher/classes", auth: { user: null, loading: true } });
    expect(screen.getByRole("status").textContent).toContain("Se verifică sesiunea");
    expect(loginHeading()).toBeNull();
    expect(forbiddenHeading()).toBeNull();
  });
});

describe("route guards: the wrong role", () => {
  it.each(PROTECTED_PATHS.filter((p) => p.startsWith("/teacher")))(
    "sends a student away from %s to the forbidden page",
    (path) => {
      renderAt(<App />, { path, auth: { user: studentUser } });
      expect(forbiddenHeading()).not.toBeNull();
      expect(loginHeading()).toBeNull();
    },
  );

  it.each(PROTECTED_PATHS.filter((p) => p.startsWith("/student")))(
    "sends a teacher away from %s to the forbidden page",
    (path) => {
      renderAt(<App />, { path, auth: { user: teacherUser } });
      expect(forbiddenHeading()).not.toBeNull();
    },
  );

  it("does not load the forbidden page's data", () => {
    renderAt(<App />, { path: "/teacher/classes", auth: { user: studentUser } });
    expect(mocks.listClasses).not.toHaveBeenCalled();
  });
});

describe("route guards: the right role", () => {
  it("lets a teacher into the teacher routes", async () => {
    renderAt(<App />, { path: "/teacher/classes", auth: { user: teacherUser } });
    expect(await screen.findByRole("heading", { name: "Clasele mele" })).not.toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledWith("teacher");
    expect(forbiddenHeading()).toBeNull();
  });

  it("lets a student into the student routes", async () => {
    renderAt(<App />, { path: "/student/classes", auth: { user: studentUser } });
    expect(await screen.findByRole("heading", { name: "Clasele mele" })).not.toBeNull();
    expect(mocks.listClasses).toHaveBeenCalledWith("student");
  });

  it("renders a placeholder for pages whose backend screens are not built yet", () => {
    renderAt(<App />, { path: "/student/progress", auth: { user: studentUser } });
    expect(screen.getByRole("heading", { name: "Progres" })).not.toBeNull();
    expect(screen.getByText(/va fi disponibilă în curând/)).not.toBeNull();
  });

  it("shows the not-found page for unknown paths", () => {
    renderAt(<App />, { path: "/nope", auth: { user: studentUser } });
    expect(screen.getByRole("heading", { name: "Pagina nu a fost găsită" })).not.toBeNull();
  });
});

describe("login redirect", () => {
  it("sends a signed-in user from /login back to where the guard sent them from", () => {
    renderAt(<App />, {
      path: { pathname: "/login", state: { from: "/student/progress" } },
      auth: { user: studentUser },
    });
    expect(screen.getByRole("heading", { name: "Progres" })).not.toBeNull();
  });

  it("ignores a redirect target that is not a same-site path", () => {
    renderAt(<App />, {
      path: { pathname: "/login", state: { from: "//evil.example/steal" } },
      auth: { user: studentUser },
    });
    expect(screen.getByRole("heading", { name: "Clasele mele" })).not.toBeNull();
  });

  it("sends a signed-in user from /login or /register to their home", () => {
    renderAt(<App />, { path: "/login", auth: { user: teacherUser } });
    expect(mocks.listClasses).toHaveBeenCalledWith("teacher");
    cleanup();
    renderAt(<App />, { path: "/register", auth: { user: studentUser } });
    expect(mocks.listClasses).toHaveBeenCalledWith("student");
  });
});
