// @vitest-environment jsdom
import type { PersonalMaterialView } from "@app/shared";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AI_DISCLAIMER } from "../components/tutor-chat";
import { PersonalMaterialScreen } from "../components/personal-material-screen";
import { StudentTopicDetailPage } from "./student-topic-detail-page";
import { StudentTopicsPage } from "./student-topics-page";

const mocks = vi.hoisted(() => ({
  listTopics: vi.fn(),
  createTopic: vi.fn(),
  deleteTopic: vi.fn(),
  listTutorMessages: vi.fn(),
  getPolicy: vi.fn(),
  listMaterials: vi.fn(),
  askTutor: vi.fn(),
  generateLesson: vi.fn(),
  generateQuiz: vi.fn(),
}));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, topics: { ...mocks } } };
});

const TOPIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const topic = {
  id: TOPIC_ID,
  title: "Rețelistică de bază",
  goal: "Să înțeleg cum funcționează un firewall",
  createdAt: "2026-10-17T10:00:00.000Z",
};
const policy = {
  policy: {
    explanationLevel: "standard",
    exampleFirst: false,
    scaffolding: "medium",
    hintsEnabled: true,
  },
  version: null,
  source: "default",
  reasonCode: null,
  note: null,
};
const history = [
  { id: "m1", role: "user", content: "Ce este un IP?", createdAt: "2026-10-17T10:01:00.000Z" },
  {
    id: "m2",
    role: "tutor",
    content: "Un **IP** este o adresă.",
    createdAt: "2026-10-17T10:01:01.000Z",
  },
];

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/student/topics/${TOPIC_ID}`]}>
      <Routes>
        <Route path="/student/topics/:id" element={<StudentTopicDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.listTopics.mockResolvedValue([topic]);
  mocks.listTutorMessages.mockResolvedValue(history);
  mocks.getPolicy.mockResolvedValue(policy);
  mocks.listMaterials.mockResolvedValue([]);
});
afterEach(cleanup);

describe("StudentTopicDetailPage", () => {
  it("renders the chat history, the policy and the permanent AI note", async () => {
    renderDetail();
    expect(await screen.findByText("Ce este un IP?")).toBeTruthy();
    expect(screen.getByText("IP").tagName).toBe("STRONG"); // tutor replies go through the markdown renderer
    expect(screen.getByTestId("policy-summary").textContent).toBe(
      "Nivel explicații: standard · Exemplu înainte de teorie: nu · Sprijin: mediu · Indicii: da",
    );
    expect(screen.getByText(AI_DISCLAIMER)).toBeTruthy();
  });

  it("appends the student's message at once and the tutor's reply after a successful send", async () => {
    let resolveReply: (value: unknown) => void = () => {};
    mocks.askTutor.mockReturnValue(new Promise((resolve) => (resolveReply = resolve)));
    renderDetail();
    await screen.findByText("Ce este un IP?");

    await userEvent.type(screen.getByLabelText("Mesajul tău"), "Dar un port?");
    await userEvent.click(screen.getByRole("button", { name: "Trimite" }));

    expect(mocks.askTutor).toHaveBeenCalledWith(TOPIC_ID, "Dar un port?");
    expect(screen.getByText("Dar un port?")).toBeTruthy(); // optimistic
    expect(screen.queryByText("Un port identifică un serviciu.")).toBeNull();

    resolveReply({
      message: {
        id: "m4",
        role: "tutor",
        content: "Un port identifică un serviciu.",
        createdAt: "2026-10-17T10:02:00.000Z",
      },
      quota: { used: 1, limit: 30 },
    });
    expect(await screen.findByText("Un port identifică un serviciu.")).toBeTruthy();
    const log = screen.getByRole("log");
    expect(within(log).getAllByText(/./).length).toBeGreaterThanOrEqual(4);
    expect((screen.getByLabelText("Mesajul tău") as HTMLTextAreaElement).value).toBe("");
  });

  it("removes the optimistic message and restores the text when the tutor fails", async () => {
    mocks.askTutor.mockRejectedValue(new ApiError(503, "AI_UNAVAILABLE"));
    renderDetail();
    await screen.findByText("Ce este un IP?");
    await userEvent.type(screen.getByLabelText("Mesajul tău"), "Dar un port?");
    await userEvent.click(screen.getByRole("button", { name: "Trimite" }));

    expect(await screen.findByText(/nu este disponibilă momentan/)).toBeTruthy();
    expect(within(screen.getByRole("log")).queryByText("Dar un port?")).toBeNull();
    expect((screen.getByLabelText("Mesajul tău") as HTMLTextAreaElement).value).toBe(
      "Dar un port?",
    );
  });

  it.each([
    [429, "QUOTA_EXCEEDED", /limita zilnică/],
    [503, "AI_UNAVAILABLE", /nu este disponibilă momentan/],
  ])(
    "shows a clear message on %s when generating a lesson, and keeps the rest working",
    async (status, code, text) => {
      mocks.generateLesson.mockRejectedValue(new ApiError(status, code));
      renderDetail();
      await screen.findByText("Ce este un IP?");
      await userEvent.click(screen.getByRole("button", { name: "Generează lecție" }));

      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByText("Ce este un IP?")).toBeTruthy(); // chat still there
      expect(screen.getByLabelText("Mesajul tău")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "Generează quiz" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );

  it("generates a quiz and lists the personal materials with links to open them", async () => {
    mocks.generateQuiz.mockResolvedValue({ quota: { used: 1, limit: 30 } });
    const material = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      topicId: TOPIC_ID,
      kind: "test",
      title: "Test: Rețelistică de bază",
      createdAt: "2026-10-17T10:03:00.000Z",
    };
    mocks.listMaterials.mockResolvedValueOnce([]).mockResolvedValue([material]);
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Generează quiz" }));

    const link = await screen.findByRole("link", { name: material.title });
    expect(link.getAttribute("href")).toBe(`/student/topics/${TOPIC_ID}/materials/${material.id}`);
    expect(mocks.generateQuiz).toHaveBeenCalledWith(TOPIC_ID, { kind: "test" });
  });

  it("says so when the topic is not the student's own", async () => {
    mocks.listTopics.mockResolvedValue([]);
    renderDetail();
    expect(await screen.findByText("Subiectul nu a fost găsit.")).toBeTruthy();
  });
});

describe("StudentTopicsPage", () => {
  function renderList() {
    return render(
      <MemoryRouter>
        <StudentTopicsPage />
      </MemoryRouter>,
    );
  }

  it("explains the space when empty", async () => {
    mocks.listTopics.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText(/Nu ai niciun subiect încă/)).toBeTruthy();
  });

  it("creates a topic, lists it and deletes it after confirmation", async () => {
    mocks.listTopics.mockResolvedValueOnce([]).mockResolvedValueOnce([topic]).mockResolvedValue([]);
    mocks.createTopic.mockResolvedValue(topic);
    mocks.deleteTopic.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderList();

    await userEvent.type(await screen.findByLabelText("Titlu"), topic.title);
    await userEvent.type(screen.getByLabelText("Ce vrei să înveți?"), topic.goal);
    await userEvent.click(screen.getByRole("button", { name: "Creează subiectul" }));
    await waitFor(() =>
      expect(mocks.createTopic).toHaveBeenCalledWith({ title: topic.title, goal: topic.goal }),
    );

    const link = await screen.findByRole("link", { name: topic.title });
    expect(link.getAttribute("href")).toBe(`/student/topics/${TOPIC_ID}`);
    await userEvent.click(screen.getByRole("button", { name: `Șterge subiectul ${topic.title}` }));
    await waitFor(() => expect(mocks.deleteTopic).toHaveBeenCalledWith(TOPIC_ID));
    expect(await screen.findByText(/Nu ai niciun subiect încă/)).toBeTruthy();
  });

  it("validates the form in Romanian before calling the API", async () => {
    mocks.listTopics.mockResolvedValue([]);
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: "Creează subiectul" }));
    expect(await screen.findByText("Introdu titlul subiectului.")).toBeTruthy();
    expect(mocks.createTopic).not.toHaveBeenCalled();
  });
});

// --- personal quiz: the answer key never reaches the student before submitting ----------------

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
const FORBIDDEN_KEYS = ["correct", "acceptedAnswers", "referenceSolution", "rubric", "explanation"];

describe("personal quiz before submitting", () => {
  const MATERIAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  // What a (buggy) server could send: the client must still never keep or show the key.
  const leakyBody = {
    material: {
      id: MATERIAL_ID,
      topicId: TOPIC_ID,
      kind: "test",
      title: "Test",
      objectives: [{ id: "o1", text: "Înțelege IP" }],
      questions: [
        {
          id: "q1",
          type: "mcq",
          prompt: "Ce este IP?",
          options: [
            { id: "a", text: "O adresă" },
            { id: "b", text: "Un cablu" },
          ],
          objectiveId: "o1",
          correct: ["a"],
          explanation: "SECRET-EXPLICATIE",
        },
        {
          id: "q2",
          type: "short",
          prompt: "Portul HTTP?",
          objectiveId: "o1",
          acceptedAnswers: ["SECRET-80"],
        },
      ],
      createdAt: "2026-10-17T10:00:00.000Z",
    },
  };

  it("the typed client drops answer-key fields and the screen shows none of them", async () => {
    const real = await vi.importActual<typeof import("../api/topics")>("../api/topics");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(leakyBody), { status: 200 })),
    );
    const view: PersonalMaterialView = await real.getMaterial(TOPIC_ID, MATERIAL_ID);
    vi.unstubAllGlobals();

    const keys = collectKeys(JSON.parse(JSON.stringify(view)));
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);

    const { container } = render(
      <MemoryRouter>
        <PersonalMaterialScreen material={view} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Ce este IP?")).toBeTruthy();
    expect(container.textContent).not.toContain("SECRET");
    expect(screen.getByRole("button", { name: "Trimite testul" })).toBeTruthy();
  });
});
