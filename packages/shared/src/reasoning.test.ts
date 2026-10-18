import { describe, expect, it } from "vitest";
import { REASONING_POINTS, reasoningVerdictSchema } from "./reasoning";

describe("reasoning verdicts", () => {
  it("maps the verdicts to full, half and no credit", () => {
    expect(REASONING_POINTS).toEqual({ CORECT: 1, PARTIAL: 0.5, GRESIT: 0 });
  });

  it("requires an explanation unless the answer is CORECT", () => {
    expect(reasoningVerdictSchema.safeParse({ verdict: "CORECT", feedback: "Bine." }).success).toBe(
      true,
    );
    for (const verdict of ["PARTIAL", "GRESIT"]) {
      expect(reasoningVerdictSchema.safeParse({ verdict, feedback: "Aproape." }).success).toBe(
        false,
      );
      expect(
        reasoningVerdictSchema.safeParse({ verdict, feedback: "Aproape.", explanation: "Uite." })
          .success,
      ).toBe(true);
    }
  });

  it("rejects unknown verdicts and empty feedback", () => {
    expect(reasoningVerdictSchema.safeParse({ verdict: "OK", feedback: "x" }).success).toBe(false);
    expect(reasoningVerdictSchema.safeParse({ verdict: "CORECT", feedback: "" }).success).toBe(
      false,
    );
  });
});
