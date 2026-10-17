// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import type { AuthUser } from "@app/shared";
import { renderAt, studentUser } from "../test/render";
import { LoginPage } from "./login-page";
import { RegisterPage } from "./register-page";

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { auth: { login: mocks.login, register: mocks.register } } };
});

// A successful session reload resolves to the signed-in user.
const refetch = vi.fn(async (): Promise<AuthUser | null> => studentUser);
const noUser = { user: null, refetch };

const user = () => userEvent.setup();
const text = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  mocks.login.mockResolvedValue({});
  mocks.register.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("login form", () => {
  it("shows Romanian validation messages for empty fields and does not call the API", async () => {
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await user().click(screen.getByRole("button", { name: "Autentifică-te" }));

    expect(await screen.findByText("Introdu adresa de email.")).not.toBeNull();
    expect(screen.getByText("Introdu parola.")).not.toBeNull();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email in Romanian", async () => {
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "nu-este-email");
    await u.type(text("Parolă"), "parola");
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));

    expect(await screen.findByText("Adresa de email nu este validă.")).not.toBeNull();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("sends the normalized credentials and then reloads the session", async () => {
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "  Ana@Example.COM ");
    await u.type(text("Parolă"), "parola-lunga");
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(mocks.login).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "parola-lunga",
    });
  });

  it("shows the Romanian message for wrong credentials, keeps the form usable, and does not reload", async () => {
    mocks.login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS"));
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "ana@example.com");
    await u.type(text("Parolă"), "gresita");
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Email sau parolă incorecte.");
    expect(refetch).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Autentifică-te" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows the fallback message for an unexpected failure", async () => {
    mocks.login.mockRejectedValue(new Error("boom"));
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "ana@example.com");
    await u.type(text("Parolă"), "parola");
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A apărut o eroare. Încearcă din nou.",
    );
  });

  it("says so when the session cannot be read right after a successful login", async () => {
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "ana@example.com");
    await u.type(text("Parolă"), "parola");

    refetch.mockResolvedValueOnce(null); // /me answered "nobody is signed in"
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A apărut o eroare. Încearcă din nou.",
    );
  });

  it("shows the network message when /me fails right after logging in", async () => {
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "ana@example.com");
    await u.type(text("Parolă"), "parola");

    refetch.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"));
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
  });

  it("limits the password length like the API does", async () => {
    const u = user();
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    await u.type(text("Email"), "ana@example.com");
    await u.click(text("Parolă"));
    await u.paste("x".repeat(129));
    await u.click(screen.getByRole("button", { name: "Autentifică-te" }));
    expect(await screen.findByText("Parola poate avea cel mult 128 de caractere.")).not.toBeNull();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("links to the registration page", () => {
    renderAt(<LoginPage />, { path: "/login", auth: noUser });
    expect(screen.getByRole("link", { name: "Înregistrează-te" }).getAttribute("href")).toBe(
      "/register",
    );
  });
});

describe("register form", () => {
  async function fill(
    u: ReturnType<typeof userEvent.setup>,
    overrides: Record<string, string> = {},
  ) {
    await u.type(text("Email"), overrides.email ?? "Ana@Example.com");
    await u.type(text("Nume afișat"), overrides.name ?? "Ana");
    await u.type(text("Parolă"), overrides.password ?? "parola-lunga");
  }

  it("defaults to student and hides the teacher code", () => {
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    expect((screen.getByRole("radio", { name: "elev" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Cod de profesor")).toBeNull();
  });

  it("shows the teacher code field only when the role is teacher", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    expect(screen.queryByLabelText("Cod de profesor")).not.toBeNull();
    await u.click(screen.getByRole("radio", { name: "elev" }));
    expect(screen.queryByLabelText("Cod de profesor")).toBeNull();
  });

  it("does not send a teacher code when registering as a student", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Creează cont" }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    expect(mocks.register).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "parola-lunga",
      role: "student",
      display_name: "Ana",
    });
    expect(mocks.register.mock.calls[0]?.[0]).not.toHaveProperty("teacher_secret");
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not send a teacher code typed earlier if the user switched back to student", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    await u.type(text("Cod de profesor"), "secret-typed-by-mistake");
    await u.click(screen.getByRole("radio", { name: "elev" }));
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Creează cont" }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    expect(mocks.register.mock.calls[0]?.[0]).not.toHaveProperty("teacher_secret");
  });

  it("sends the teacher code when registering as a teacher", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    await fill(u, { email: "prof@example.com", name: "Profesor" });
    await u.type(text("Cod de profesor"), "codul-meu");
    await u.click(screen.getByRole("button", { name: "Creează cont" }));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    expect(mocks.register).toHaveBeenCalledWith({
      email: "prof@example.com",
      password: "parola-lunga",
      role: "teacher",
      display_name: "Profesor",
      teacher_secret: "codul-meu",
    });
  });

  it("requires the teacher code for teachers, in Romanian", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Creează cont" }));

    expect(await screen.findByText("Introdu codul de profesor.")).not.toBeNull();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("shows Romanian messages for empty and too-short fields", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("button", { name: "Creează cont" }));
    expect(await screen.findByText("Introdu adresa de email.")).not.toBeNull();
    expect(screen.getByText("Introdu un nume afișat.")).not.toBeNull();
    expect(screen.getByText("Parola trebuie să aibă cel puțin 8 caractere.")).not.toBeNull();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("limits the display name length", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await fill(u, { name: "x".repeat(61) });
    await u.click(screen.getByRole("button", { name: "Creează cont" }));
    expect(
      await screen.findByText("Numele afișat poate avea cel mult 60 de caractere."),
    ).not.toBeNull();
  });

  it("says so when the session cannot be read right after registering", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await fill(u);
    refetch.mockResolvedValueOnce(null);
    await u.click(screen.getByRole("button", { name: "Creează cont" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A apărut o eroare. Încearcă din nou.",
    );
  });

  it("limits the teacher code length like the API does", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    await fill(u);
    await u.click(text("Cod de profesor"));
    await u.paste("c".repeat(257));
    await u.click(screen.getByRole("button", { name: "Creează cont" }));
    expect(await screen.findByText("Codul de profesor este prea lung.")).not.toBeNull();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("explains that the display name should not be a full name", () => {
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    expect(screen.getByText(/nu numele complet/)).not.toBeNull();
  });

  it.each([
    ["EMAIL_TAKEN", "Există deja un cont cu această adresă de email."],
    ["INVALID_TEACHER_SECRET", "Codul de profesor este incorect."],
    ["RATE_LIMITED", "Prea multe încercări. Așteaptă puțin și încearcă din nou."],
  ])("maps the API error %s to Romanian", async (code, message) => {
    mocks.register.mockRejectedValue(new ApiError(409, code));
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await fill(u);
    await u.click(screen.getByRole("button", { name: "Creează cont" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("masks the password and the teacher code", async () => {
    const u = user();
    renderAt(<RegisterPage />, { path: "/register", auth: noUser });
    await u.click(screen.getByRole("radio", { name: "profesor" }));
    expect(text("Parolă").type).toBe("password");
    expect(text("Cod de profesor").type).toBe("password");
  });
});
