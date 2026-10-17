// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectiveProgressPanel } from "./objective-progress-panel";

const mocks = vi.hoisted(() => ({ getObjectiveProgress: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, materials: { ...mocks } } };
});

const O1 = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => mocks.getObjectiveProgress.mockReset());
afterEach(cleanup);

describe("ObjectiveProgressPanel", () => {
  it("shows each student's own status, attempts and strategies in their own row", async () => {
    mocks.getObjectiveProgress.mockResolvedValue({
      objectives: [{ id: O1, text: "Definește funcții" }],
      students: [
        {
          studentId: S1,
          displayName: "Ana",
          classNames: ["9A"],
          objectives: [
            {
              objectiveId: O1,
              status: "mastered",
              attemptsCount: 3,
              strategiesTried: ["ANALOGIE", "PAS_CU_PAS"],
            },
          ],
        },
        {
          studentId: S2,
          displayName: "Bob",
          classNames: ["9A"],
          objectives: [
            { objectiveId: O1, status: "not_started", attemptsCount: 0, strategiesTried: [] },
          ],
        },
      ],
    });
    render(<ObjectiveProgressPanel materialId="m1" />);
    const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
    const bob = screen.getByText("Bob").closest("tr") as HTMLElement;
    expect(within(ana).getByText("Stăpânit")).toBeTruthy();
    expect(within(ana).getByText("Încercări: 3")).toBeTruthy();
    expect(within(ana).getByText("Analogie → Pas cu pas")).toBeTruthy();
    expect(within(bob).getByText("Neînceput")).toBeTruthy();
    expect(within(bob).getByText("Încercări: 0")).toBeTruthy();
    expect(within(bob).queryByText("Stăpânit")).toBeNull();
  });

  it("highlights who asked for help, on that student's row only", async () => {
    const cell = (helpRequestedAt: string | null) => ({
      objectiveId: O1,
      status: "struggling",
      attemptsCount: 6,
      strategiesTried: ["ANALOGIE"],
      helpRequestedAt,
    });
    mocks.getObjectiveProgress.mockResolvedValue({
      objectives: [{ id: O1, text: "Definește funcții" }],
      students: [
        {
          studentId: S1,
          displayName: "Ana",
          classNames: ["9A"],
          objectives: [cell("2026-10-18T09:00:00.000Z")],
        },
        { studentId: S2, displayName: "Bob", classNames: ["9A"], objectives: [cell(null)] },
      ],
    });
    render(<ObjectiveProgressPanel materialId="m1" />);
    const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
    const bob = screen.getByText("Bob").closest("tr") as HTMLElement;
    expect(within(ana).getByText("Cere ajutor")).toBeTruthy();
    expect(within(bob).queryByText("Cere ajutor")).toBeNull();
  });

  it("explains an empty class and shows API errors", async () => {
    mocks.getObjectiveProgress.mockResolvedValueOnce({ objectives: [], students: [] });
    const { unmount } = render(<ObjectiveProgressPanel materialId="m1" />);
    expect(await screen.findByText(/nu este atribuit încă/)).toBeTruthy();
    unmount();
    mocks.getObjectiveProgress.mockRejectedValueOnce(new Error("x"));
    render(<ObjectiveProgressPanel materialId="m1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
