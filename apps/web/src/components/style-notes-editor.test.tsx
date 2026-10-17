// @vitest-environment jsdom
import { MAX_STYLE_NOTES_CHARS } from "@app/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { StyleNotesEditor } from "./style-notes-editor";

const mocks = vi.hoisted(() => ({ updateStyleNotes: vi.fn(), extractStyleNotes: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { documents: mocks } };
});

const CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const box = () => screen.getByLabelText("Notițe de stil") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: "Salvează" }) as HTMLButtonElement;
const suggestButton = () =>
  screen.getByRole("button", { name: /Sugerează din documente|Se generează sugestia/ });

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const suggestion = {
  suggestion: "Ton direct. Exemple cu cod.",
  basedOnChunks: 3,
  quota: { used: 2, limit: 20 },
};

describe("saving style notes", () => {
  it("shows the saved notes, and Save is enabled only once something changed", () => {
    render(<StyleNotesEditor classId={CLASS_ID} initialValue="Ton prietenos." />);
    expect(box().value).toBe("Ton prietenos.");
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "Ton prietenos și scurt." } });
    expect(saveButton().disabled).toBe(false);
  });

  it("starts empty when there are no notes yet", () => {
    render(<StyleNotesEditor classId={CLASS_ID} initialValue={null} />);
    expect(box().value).toBe("");
  });

  it("saves through the API and confirms", async () => {
    mocks.updateStyleNotes.mockResolvedValue({ class_id: CLASS_ID, style_notes: "Notițe noi." });
    render(<StyleNotesEditor classId={CLASS_ID} initialValue={null} />);
    fireEvent.change(box(), { target: { value: "  Notițe noi.  " } });
    await userEvent.setup().click(saveButton());

    await waitFor(() =>
      expect(mocks.updateStyleNotes).toHaveBeenCalledWith(CLASS_ID, "  Notițe noi.  "),
    );
    expect((await screen.findByRole("status")).textContent).toBe("Notițele au fost salvate.");
    expect(box().value).toBe("Notițe noi."); // what the server stored (trimmed)
    expect(saveButton().disabled).toBe(true);
  });

  it("clearing the box and saving sends an empty string (which clears the notes)", async () => {
    mocks.updateStyleNotes.mockResolvedValue({ class_id: CLASS_ID, style_notes: null });
    render(<StyleNotesEditor classId={CLASS_ID} initialValue="Vechi." />);
    fireEvent.change(box(), { target: { value: "" } });
    await userEvent.setup().click(saveButton());
    await waitFor(() => expect(mocks.updateStyleNotes).toHaveBeenCalledWith(CLASS_ID, ""));
    await waitFor(() => expect(box().value).toBe(""));
  });

  it("blocks saving a text over the limit, with a counter, and shows save errors in Romanian", async () => {
    render(<StyleNotesEditor classId={CLASS_ID} initialValue={null} />);
    fireEvent.change(box(), { target: { value: "a".repeat(MAX_STYLE_NOTES_CHARS + 1) } });
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(/2001 \/ 2000 caractere — textul este prea lung/)).not.toBeNull();

    fireEvent.change(box(), { target: { value: "ok" } });
    mocks.updateStyleNotes.mockRejectedValue(new ApiError(0, "NETWORK_ERROR"));
    await userEvent.setup().click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    expect(box().value).toBe("ok"); // nothing lost
  });
});

describe("extracting a suggestion", () => {
  it("shows the suggestion and the quota, and saves nothing", async () => {
    mocks.extractStyleNotes.mockResolvedValue(suggestion);
    render(<StyleNotesEditor classId={CLASS_ID} initialValue="Ce am deja." />);
    await userEvent.setup().click(suggestButton());

    const panel = await screen.findByRole("region", { name: "Sugestie de stil" });
    expect(panel.textContent).toContain("Ton direct. Exemple cu cod.");
    expect(panel.textContent).toContain("Ai folosit 2 din 20 generări AI azi.");
    expect(mocks.extractStyleNotes).toHaveBeenCalledWith(CLASS_ID);
    expect(mocks.updateStyleNotes).not.toHaveBeenCalled();
    expect(box().value).toBe("Ce am deja."); // the box is untouched until the teacher accepts
  });

  it("accepting fills the text box but still requires pressing Save", async () => {
    mocks.extractStyleNotes.mockResolvedValue(suggestion);
    mocks.updateStyleNotes.mockResolvedValue({
      class_id: CLASS_ID,
      style_notes: suggestion.suggestion,
    });
    const u = userEvent.setup();
    render(<StyleNotesEditor classId={CLASS_ID} initialValue="Ce am deja." />);
    await u.click(suggestButton());
    await u.click(await screen.findByRole("button", { name: "Folosește sugestia" }));

    expect(box().value).toBe("Ton direct. Exemple cu cod.");
    expect(screen.queryByRole("region", { name: "Sugestie de stil" })).toBeNull();
    expect(screen.getByText(/Sugestia a fost copiată în câmp\. Apasă „Salvează”/)).not.toBeNull();
    expect(mocks.updateStyleNotes).not.toHaveBeenCalled(); // not saved yet
    expect(saveButton().disabled).toBe(false);

    await u.click(saveButton());
    await waitFor(() =>
      expect(mocks.updateStyleNotes).toHaveBeenCalledWith(CLASS_ID, "Ton direct. Exemple cu cod."),
    );
  });

  it("discarding closes the suggestion and leaves the notes as they were", async () => {
    mocks.extractStyleNotes.mockResolvedValue(suggestion);
    const u = userEvent.setup();
    render(<StyleNotesEditor classId={CLASS_ID} initialValue="Ce am deja." />);
    await u.click(suggestButton());
    await u.click(await screen.findByRole("button", { name: "Renunță" }));
    expect(screen.queryByRole("region", { name: "Sugestie de stil" })).toBeNull();
    expect(box().value).toBe("Ce am deja.");
    expect(saveButton().disabled).toBe(true);
  });

  it.each([
    ["QUOTA_EXCEEDED", 429, "Ai atins limita zilnică de generări cu AI. Încearcă din nou mâine."],
    ["AI_UNAVAILABLE", 503, "Generarea cu AI nu este disponibilă momentan. Încearcă mai târziu."],
    ["NO_DOCUMENTS", 400, "Adaugă mai întâi un document."],
  ])("shows %s in Romanian without breaking the editor", async (code, status, message) => {
    mocks.extractStyleNotes.mockRejectedValue(new ApiError(status, code));
    mocks.updateStyleNotes.mockResolvedValue({ class_id: CLASS_ID, style_notes: "încă merge" });
    const u = userEvent.setup();
    render(<StyleNotesEditor classId={CLASS_ID} initialValue={null} />);
    await u.click(suggestButton());
    expect((await screen.findByRole("alert")).textContent).toBe(message);

    // Not fatal: the teacher can still type and save by hand.
    fireEvent.change(box(), { target: { value: "încă merge" } });
    await u.click(saveButton());
    await waitFor(() => expect(mocks.updateStyleNotes).toHaveBeenCalledTimes(1));
  });
});
