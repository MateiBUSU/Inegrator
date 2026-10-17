// @vitest-environment jsdom
import { MAX_DOCUMENT_BYTES, type DocumentSummary } from "@app/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { DocumentsSection, documentTextProblem } from "./documents-section";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { documents: mocks } };
});

const CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const doc = (id: string, title: string, chunks = 3): DocumentSummary => ({
  id,
  title,
  chunk_count: chunks,
  created_at: "2026-10-17T10:00:00.000Z",
});

const renderSection = () => render(<DocumentsSection classId={CLASS_ID} />);
const textbox = () => screen.getByLabelText("Sau lipește textul aici") as HTMLTextAreaElement;
const titleBox = () => screen.getByLabelText("Titlu") as HTMLInputElement;
const addButton = () => screen.getByRole("button", { name: "Adaugă documentul" });

beforeEach(() => {
  mocks.listDocuments.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("personal-data warning", () => {
  it("is visible, in Romanian, right above the upload form", async () => {
    renderSection();
    const warning = await screen.findByRole("note");
    expect(warning.textContent).toContain(
      "nu încărca documente care conțin date personale ale elevilor",
    );
    expect(warning.textContent).toContain("nume, note, date de contact");
    expect(warning.textContent).toContain("serviciu AI extern");
    // It comes before the form in the page, so it is read before anything is uploaded.
    const form = screen.getByRole("heading", { name: "Adaugă un document" }).closest("form");
    expect(
      warning.compareDocumentPosition(form as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("document list", () => {
  it("shows loading, then each document with its fragment count and date", async () => {
    mocks.listDocuments.mockResolvedValue([
      doc("d1", "Curs bucle", 12),
      doc("d2", "Curs funcții", 4),
    ]);
    renderSection();
    expect(screen.getByText("Se încarcă documentele…")).not.toBeNull();
    expect(await screen.findByText("Curs bucle")).not.toBeNull();
    expect(screen.getByText(/12 fragmente/)).not.toBeNull();
    expect(screen.getByText(/4 fragmente/)).not.toBeNull();
    expect(screen.getByText(/2 \/ 20 documente/)).not.toBeNull();
    expect(mocks.listDocuments).toHaveBeenCalledWith(CLASS_ID);
  });

  it("shows an empty state and an error state with retry", async () => {
    const { unmount } = renderSection();
    expect(
      await screen.findByText("Nu ai încărcat niciun document pentru această clasă."),
    ).not.toBeNull();
    unmount();

    mocks.listDocuments
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR"))
      .mockResolvedValueOnce([doc("d1", "Curs")]);
    renderSection();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Nu m-am putut conecta la server",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Încearcă din nou" }));
    expect(await screen.findByText("Curs")).not.toBeNull();
  });
});

describe("adding a document", () => {
  it("sends the trimmed title and the text, then clears the form and reloads the list", async () => {
    mocks.listDocuments.mockResolvedValueOnce([]).mockResolvedValueOnce([doc("d1", "Curs nou")]);
    mocks.createDocument.mockResolvedValue(doc("d1", "Curs nou"));
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);

    await u.type(titleBox(), "  Curs nou  ");
    fireEvent.change(textbox(), { target: { value: "Conținutul cursului." } });
    await u.click(addButton());

    await waitFor(() =>
      expect(mocks.createDocument).toHaveBeenCalledWith(CLASS_ID, {
        title: "Curs nou",
        text: "Conținutul cursului.",
      }),
    );
    expect(await screen.findByText("Curs nou")).not.toBeNull();
    expect(titleBox().value).toBe("");
    expect(textbox().value).toBe("");
  });

  it("rejects a text over 200 KB with a clear Romanian message BEFORE anything is sent", async () => {
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);

    await u.type(titleBox(), "Prea mare");
    fireEvent.change(textbox(), { target: { value: "a".repeat(MAX_DOCUMENT_BYTES + 1) } });
    expect(screen.getByText("200,1 KB / 200,0 KB")).not.toBeNull(); // live size, already over
    await u.click(addButton());

    const message = await screen.findByText(/Documentul are 200,1 KB, iar limita este 200,0 KB/);
    expect(message.textContent).toContain("Scurtează textul sau împarte-l în mai multe documente.");
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("measures the limit in bytes, so a text of 110,000 diacritics (220,000 bytes) is rejected", async () => {
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    await u.type(titleBox(), "Diacritice");
    fireEvent.change(textbox(), { target: { value: "ș".repeat(110_000) } });
    await u.click(addButton());
    expect(await screen.findByText(/iar limita este 200,0 KB/)).not.toBeNull();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("accepts a text of exactly 200 KB", async () => {
    mocks.createDocument.mockResolvedValue(doc("d1", "Exact"));
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    await u.type(titleBox(), "Exact");
    fireEvent.change(textbox(), { target: { value: "a".repeat(MAX_DOCUMENT_BYTES) } });
    await u.click(addButton());
    await waitFor(() => expect(mocks.createDocument).toHaveBeenCalledTimes(1));
  });

  it("asks for a title and for text, in Romanian, without calling the API", async () => {
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    await u.click(addButton());
    expect(await screen.findByText("Introdu un titlu.")).not.toBeNull();
    expect(screen.getByText("Introdu textul documentului.")).not.toBeNull();
    fireEvent.change(textbox(), { target: { value: "   \n  " } });
    await u.type(titleBox(), "x");
    await u.click(addButton());
    expect(screen.getByText("Introdu textul documentului.")).not.toBeNull();
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("shows the API's refusal in Romanian (e.g. the 20-document limit) and keeps what was typed", async () => {
    mocks.createDocument.mockRejectedValue(new ApiError(409, "DOCUMENT_LIMIT_REACHED"));
    const u = userEvent.setup();
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    await u.type(titleBox(), "Încă unul");
    fireEvent.change(textbox(), { target: { value: "Text." } });
    await u.click(addButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Ai atins numărul maxim de documente pentru această clasă.",
    );
    expect(textbox().value).toBe("Text.");
  });
});

describe("uploading a text file", () => {
  const fileInput = () => screen.getByLabelText(/Încarcă un fișier text/) as HTMLInputElement;

  it("fills the text and (when empty) the title from the file", async () => {
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    const file = new File(["Text din fișier."], "curs-bucle.md", { type: "text/markdown" });
    await userEvent.setup().upload(fileInput(), file);
    await waitFor(() => expect(textbox().value).toBe("Text din fișier."));
    expect(titleBox().value).toBe("curs-bucle");
  });

  it("rejects an oversized file from its size alone, without reading it", async () => {
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    const big = new File(["x"], "mare.txt", { type: "text/plain" });
    Object.defineProperty(big, "size", { value: MAX_DOCUMENT_BYTES + 1 });
    const readText = vi.spyOn(big, "text");
    fireEvent.change(fileInput(), { target: { files: [big] } });

    expect(
      await screen.findByText(/Fișierul are 200,1 KB, iar limita este 200,0 KB/),
    ).not.toBeNull();
    expect(readText).not.toHaveBeenCalled();
    expect(textbox().value).toBe("");
  });
});

describe("deleting a document", () => {
  it("asks for confirmation first, then deletes and reloads", async () => {
    mocks.listDocuments.mockResolvedValueOnce([doc("d1", "Curs bucle")]).mockResolvedValueOnce([]);
    mocks.deleteDocument.mockResolvedValue(undefined);
    const u = userEvent.setup();
    renderSection();

    await u.click(await screen.findByRole("button", { name: "Șterge documentul Curs bucle" }));
    expect(mocks.deleteDocument).not.toHaveBeenCalled(); // one click is not enough
    await u.click(screen.getByRole("button", { name: "Da, șterge" }));

    await waitFor(() => expect(mocks.deleteDocument).toHaveBeenCalledWith("d1"));
    expect(await screen.findByText(/Nu ai încărcat niciun document/)).not.toBeNull();
  });

  it("can be cancelled", async () => {
    mocks.listDocuments.mockResolvedValue([doc("d1", "Curs bucle")]);
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Șterge documentul Curs bucle" }));
    await u.click(screen.getByRole("button", { name: "Anulează" }));
    expect(screen.getByRole("button", { name: "Șterge documentul Curs bucle" })).not.toBeNull();
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });

  it("shows a failed delete in Romanian and keeps the document", async () => {
    mocks.listDocuments.mockResolvedValue([doc("d1", "Curs bucle")]);
    mocks.deleteDocument.mockRejectedValue(new ApiError(404, "DOCUMENT_NOT_FOUND"));
    const u = userEvent.setup();
    renderSection();
    await u.click(await screen.findByRole("button", { name: "Șterge documentul Curs bucle" }));
    await u.click(screen.getByRole("button", { name: "Da, șterge" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Documentul nu a fost găsit.");
    expect(within(document.body).getByText("Curs bucle")).not.toBeNull();
  });
});

describe("documentTextProblem", () => {
  it("returns Romanian messages for each problem and null for a good text", () => {
    expect(documentTextProblem("Text bun.")).toBeNull();
    expect(documentTextProblem("   ")).toBe("Introdu textul documentului.");
    expect(documentTextProblem("a".repeat(MAX_DOCUMENT_BYTES))).toBeNull();
    expect(documentTextProblem("a".repeat(MAX_DOCUMENT_BYTES + 1))).toContain(
      "iar limita este 200,0 KB",
    );
    expect(documentTextProblem("a\u0000b")).toBe(
      "Textul conține caractere care nu pot fi salvate.",
    );
    expect(documentTextProblem("a\ud800b")).toBe(
      "Textul conține caractere care nu pot fi salvate.",
    );
  });
});

describe("an unreadable file", () => {
  it("shows a Romanian message instead of failing silently", async () => {
    renderSection();
    await screen.findByText(/Nu ai încărcat niciun document/);
    const file = new File(["x"], "stricat.txt", { type: "text/plain" });
    vi.spyOn(file, "text").mockRejectedValue(new Error("read failed"));
    fireEvent.change(screen.getByLabelText(/Încarcă un fișier text/), {
      target: { files: [file] },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("Nu am putut citi fișierul");
  });
});
