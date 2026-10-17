// @vitest-environment jsdom
import type { AuthUser } from "@app/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { studentUser, teacherUser } from "../test/render";
import { AuthProvider } from "./auth-context";

// The real AuthProvider, API client, guards, layout and pages together, in a router. The only
// fake is the network: `fetch` answers like the API would, based on `session` (who the cookie
// belongs to). Nothing in apps/web is mocked.
let session: AuthUser | null;
let loginYields: AuthUser;
let loginFails: boolean;
let logoutFails: boolean;
let failNextClassList: boolean;
const requests: { method: string; path: string; credentials: RequestCredentials | undefined }[] =
  [];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string) => json(status, { error: { code, message: "x" } });

function serve(url: string, init: RequestInit): Response {
  const path = url.replace(/^\/api/, "");
  const method = init.method ?? "GET";
  requests.push({ method, path, credentials: init.credentials });

  if (path === "/auth/me")
    return session ? json(200, { user: session }) : apiError(401, "UNAUTHENTICATED");
  if (path === "/auth/login" && method === "POST") {
    if (loginFails) return apiError(401, "INVALID_CREDENTIALS");
    session = loginYields;
    return json(200, { user: session });
  }
  if (path === "/auth/logout" && method === "POST") {
    if (logoutFails) throw new TypeError("Failed to fetch");
    session = null;
    return new Response(null, { status: 204 });
  }
  if (path === "/classes") {
    if (!session) return apiError(401, "UNAUTHENTICATED");
    if (failNextClassList) {
      failNextClassList = false;
      return apiError(500, "INTERNAL_ERROR");
    }
    return json(200, { classes: [] });
  }
  return apiError(404, "NOT_FOUND");
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillLogin(email = "ana@example.com") {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText("Adresă de email"), email);
  await u.type(screen.getByLabelText("Parolă"), "parola-lunga");
  await u.click(screen.getByRole("button", { name: "Autentifică-te" }));
}

// The first render of the file is slow when the whole suite runs in parallel; 1 s was flaky.
const heading = (name: string) => screen.findByRole("heading", { name }, { timeout: 5000 });
const classListRequests = () => requests.filter((r) => r.path === "/classes").length;

beforeEach(() => {
  session = null;
  loginYields = studentUser;
  loginFails = false;
  logoutFails = false;
  failNextClassList = false;
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => serve(url, init)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("signing in", () => {
  it("sends an unauthenticated visitor to /login, then back to the page they wanted", async () => {
    renderAt("/teacher/classes");
    expect(await heading("Autentifică-te în cont")).not.toBeNull();
    expect(classListRequests()).toBe(0); // the protected page never even asked for data

    loginYields = teacherUser;
    await fillLogin("prof@example.com");

    expect(await heading("Clasele mele")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Autentifică-te în cont" })).toBeNull();
    expect(screen.getByText("Prof Test")).not.toBeNull();
    expect(classListRequests()).toBe(1);
  });

  it("sends a student who was bounced from a teacher page to the student home, not to /forbidden", async () => {
    renderAt("/teacher/classes");
    await heading("Autentifică-te în cont");

    loginYields = studentUser;
    await fillLogin();

    expect(await heading("Clasele mele")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Acces interzis" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Intră într-o clasă" })).not.toBeNull(); // student page
  });

  it("stays on the login page with a Romanian message when the credentials are wrong", async () => {
    loginFails = true;
    renderAt("/login");
    await fillLogin();
    expect((await screen.findByRole("alert")).textContent).toBe("Email sau parolă incorecte.");
    expect(screen.getByRole("heading", { name: "Autentifică-te în cont" })).not.toBeNull();
    expect(session).toBeNull();
  });

  it("restores an existing session on first load, so a page reload keeps you signed in", async () => {
    session = studentUser;
    renderAt("/student/classes");
    expect(await heading("Clasele mele")).not.toBeNull();
    expect(screen.getByText("Elev Test")).not.toBeNull();
  });

  it("sends the session cookie with every request", async () => {
    session = studentUser;
    renderAt("/student/classes");
    await heading("Clasele mele");
    expect(requests.length).toBeGreaterThanOrEqual(2); // /auth/me and /classes
    expect(requests.every((r) => r.credentials === "include")).toBe(true);
  });
});

describe("signing out", () => {
  it("logs out, shows the login page, and protects the pages again", async () => {
    session = studentUser;
    renderAt("/student/classes");
    await heading("Clasele mele");

    await userEvent.setup().click(screen.getByRole("button", { name: "Deconectare" }));

    expect(await heading("Autentifică-te în cont")).not.toBeNull();
    expect(session).toBeNull();
    expect(screen.queryByRole("button", { name: "Deconectare" })).toBeNull();
    expect(screen.queryByText("Elev Test")).toBeNull();
  });

  it("reports a failed logout in Romanian and keeps the user on the page", async () => {
    session = studentUser;
    logoutFails = true;
    renderAt("/student/classes");
    await heading("Clasele mele");

    await userEvent.setup().click(screen.getByRole("button", { name: "Deconectare" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    expect(screen.getByRole("heading", { name: "Clasele mele" })).not.toBeNull();
    expect(session).not.toBeNull();
  });
});

describe("a session that ends while the page is open", () => {
  it("sends the user to /login when the next API call is refused with UNAUTHENTICATED", async () => {
    session = studentUser;
    failNextClassList = true; // the first load fails, so the page offers "try again"
    renderAt("/student/classes");
    const retry = await screen.findByRole("button", { name: "Încearcă din nou" });
    const meCallsBefore = requests.filter((r) => r.path === "/auth/me").length;

    session = null; // the cookie expires while the error is on screen
    await userEvent.setup().click(retry);

    // /classes answers 401 UNAUTHENTICATED -> the client tells the provider -> /auth/me says
    // nobody is signed in -> the route guard redirects.
    expect(await heading("Autentifică-te în cont")).not.toBeNull();
    expect(requests.filter((r) => r.path === "/auth/me").length).toBe(meCallsBefore + 1);
    expect(screen.queryByRole("button", { name: "Deconectare" })).toBeNull();
  });
});
