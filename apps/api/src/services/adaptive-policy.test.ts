import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, type Policy } from "@app/shared";
import { ADAPTATION, type AdaptationConfig } from "../config/adaptation";
import {
  evaluatePolicy,
  type ObservedAnswer,
  type ObservedAttempt,
  type PolicyChange,
} from "./adaptive-policy";

const OBJ = "obj-1";
const OTHER = "obj-2";
const base = new Date("2026-10-01T10:00:00Z").getTime();
const at = (minutes: number) => new Date(base + minutes * 60_000);

const right = (objectiveId = OBJ): ObservedAnswer => ({ objectiveId, isCorrect: true });
const wrong = (objectiveId = OBJ): ObservedAnswer => ({ objectiveId, isCorrect: false });
const ungraded = (objectiveId = OBJ): ObservedAnswer => ({ objectiveId, isCorrect: null });

/** An attempt whose score follows its answers (programming self-evaluation is not scored). */
function attempt(minutes: number, answers: ObservedAnswer[]): ObservedAttempt {
  const graded = answers.filter((a) => a.isCorrect !== null);
  return {
    submittedAt: at(minutes),
    score: graded.filter((a) => a.isCorrect).length,
    maxScore: graded.length,
    answers,
  };
}

const evaluate = (
  attempts: ObservedAttempt[],
  overrides: { current?: Policy; lastVersionAt?: Date | null; config?: AdaptationConfig } = {},
) =>
  evaluatePolicy({
    current: overrides.current ?? DEFAULT_POLICY,
    lastVersionAt: overrides.lastVersionAt ?? null,
    attempts,
    ...(overrides.config ? { config: overrides.config } : {}),
  });

describe("thresholds come from config", () => {
  it("uses the documented defaults", () => {
    expect(ADAPTATION).toEqual({
      minNewObservations: 3,
      wrongAnswersThreshold: 3,
      errorWindowAttempts: 5,
      accuracyAttempts: 3,
      accuracyThreshold: 0.8,
    });
  });
});

describe("Rule A: repeated errors on one objective", () => {
  it("exactly 3 wrong answers on the same objective raises scaffolding one level and sets example_first", () => {
    const change = evaluate([attempt(1, [wrong(), wrong(), wrong()])]);
    expect(change).not.toBeNull();
    expect(change?.reasonCode).toBe("REPEATED_OBJECTIVE_ERRORS");
    expect(change?.policy).toEqual({ ...DEFAULT_POLICY, scaffolding: "high", exampleFirst: true });
  });

  it("2 wrong answers do not trigger it, even alongside a correct one (3 observations)", () => {
    expect(evaluate([attempt(1, [wrong(), wrong(), right()])])).toBeNull();
  });

  it("counts wrong answers across attempts", () => {
    const change = evaluate([
      attempt(1, [wrong(), right()]),
      attempt(2, [wrong(), right()]),
      attempt(3, [wrong(), right()]),
    ]);
    expect(change?.reasonCode).toBe("REPEATED_OBJECTIVE_ERRORS");
  });

  it("does not add up errors on different objectives", () => {
    expect(evaluate([attempt(1, [wrong(OBJ), wrong(OBJ), wrong(OTHER), wrong(OTHER)])])).toBeNull();
  });

  it("moves exactly one level: low -> medium, medium -> high", () => {
    const wrongs = [attempt(1, [wrong(), wrong(), wrong()])];
    expect(
      evaluate(wrongs, { current: { ...DEFAULT_POLICY, scaffolding: "low" } })?.policy,
    ).toMatchObject({ scaffolding: "medium", exampleFirst: true });
    expect(
      evaluate(wrongs, { current: { ...DEFAULT_POLICY, scaffolding: "medium" } })?.policy,
    ).toMatchObject({ scaffolding: "high", exampleFirst: true });
  });

  it("is capped at high; with example_first already on there is nothing left to change", () => {
    const current: Policy = { ...DEFAULT_POLICY, scaffolding: "high", exampleFirst: true };
    expect(evaluate([attempt(1, [wrong(), wrong(), wrong()])], { current })).toBeNull();
  });

  it("at the cap it still turns example_first on if that was off", () => {
    const current: Policy = { ...DEFAULT_POLICY, scaffolding: "high", exampleFirst: false };
    expect(evaluate([attempt(1, [wrong(), wrong(), wrong()])], { current })?.policy).toMatchObject({
      scaffolding: "high",
      exampleFirst: true,
    });
  });

  it("only looks at the most recent attempts (window of 5)", () => {
    // Three wrong answers, but spread so that only 2 fall inside the latest 5 attempts.
    const attempts = [
      attempt(1, [wrong()]),
      attempt(2, [right()]),
      attempt(3, [right()]),
      attempt(4, [right()]),
      attempt(5, [wrong()]),
      attempt(6, [wrong()]),
    ];
    expect(evaluate(attempts)).toBeNull();
  });

  it("ignores ungraded answers: they are neither errors nor observations", () => {
    expect(evaluate([attempt(1, [ungraded(), ungraded(), ungraded()])])).toBeNull();
    expect(evaluate([attempt(1, [wrong(), wrong(), ungraded(), ungraded()])])).toBeNull();
  });
});

describe("the 3-new-observations gate", () => {
  it("one data point never moves the policy, however extreme", () => {
    expect(evaluate([attempt(1, [wrong()])])).toBeNull();
    expect(evaluate([attempt(1, [right()])])).toBeNull();
  });

  it("two observations are not enough, three are", () => {
    const config: AdaptationConfig = { ...ADAPTATION, wrongAnswersThreshold: 2 };
    expect(evaluate([attempt(1, [wrong(), wrong()])], { config })).toBeNull();
    expect(evaluate([attempt(1, [wrong(), wrong(), right()])], { config })?.reasonCode).toBe(
      "REPEATED_OBJECTIVE_ERRORS",
    );
  });

  it("only counts observations recorded after the last policy version", () => {
    const old = [attempt(1, [wrong(), wrong(), wrong()])];
    // The old errors were already acted on by a version created at minute 10.
    expect(evaluate(old, { lastVersionAt: at(10) })).toBeNull();
    // One fresh wrong answer is a single new observation: still nothing.
    expect(evaluate([...old, attempt(11, [wrong()])], { lastVersionAt: at(10) })).toBeNull();
    // Three fresh wrong answers are enough, and the old ones are not counted twice.
    const fresh = evaluate([...old, attempt(11, [wrong(), wrong(), wrong()])], {
      lastVersionAt: at(10),
    });
    expect(fresh?.reasonCode).toBe("REPEATED_OBJECTIVE_ERRORS");
    expect(fresh?.note).toContain("3 greșeli");
  });

  it("an attempt submitted exactly at the version's timestamp is not new", () => {
    expect(
      evaluate([attempt(10, [wrong(), wrong(), wrong()])], { lastVersionAt: at(10) }),
    ).toBeNull();
  });

  it("changes nothing for a student with no attempts", () => {
    expect(evaluate([])).toBeNull();
  });
});

describe("Rule B: high accuracy", () => {
  const good = (minutes: number) => attempt(minutes, [right(), right(), right(), right(), wrong()]); // 80%
  const perfect = (minutes: number) => attempt(minutes, [right(), right(), right(), right()]);

  it("the last 3 attempts averaging exactly 80% raise explanation one level and lower scaffolding", () => {
    const change = evaluate([good(1), good(2), good(3)]);
    expect(change?.reasonCode).toBe("HIGH_ACCURACY");
    expect(change?.policy).toEqual({
      ...DEFAULT_POLICY,
      explanationLevel: "advanced",
      scaffolding: "low",
    });
  });

  it("just below 80% does nothing", () => {
    // 80%, 80% and 60%: the average is 73%, and no objective has 3 misses.
    const attempts = [
      attempt(1, [right(), right(), right(), right(), wrong("o1")]),
      attempt(2, [right(), right(), right(), right(), wrong("o2")]),
      attempt(3, [right(), right(), right(), wrong("o3"), wrong("o4")]),
    ];
    expect(evaluate(attempts)).toBeNull();
  });

  it("needs 3 attempts, not 2", () => {
    expect(evaluate([perfect(1), perfect(2)])).toBeNull();
  });

  it("averages only the latest 3 of many", () => {
    const awful = attempt(1, [wrong(), wrong(), wrong(OTHER)]);
    // Latest three are perfect, so the old bad attempt is outside the window... but it still
    // contributes 3 wrong answers on distinct objectives, which is under the Rule A threshold.
    const change = evaluate([awful, perfect(2), perfect(3), perfect(4)]);
    expect(change?.reasonCode).toBe("HIGH_ACCURACY");
  });

  it("goes one level at a time and is capped: basic -> standard, advanced stays", () => {
    const attempts = [perfect(1), perfect(2), perfect(3)];
    expect(
      evaluate(attempts, { current: { ...DEFAULT_POLICY, explanationLevel: "basic" } })?.policy,
    ).toMatchObject({ explanationLevel: "standard" });
    expect(
      evaluate(attempts, {
        current: { ...DEFAULT_POLICY, explanationLevel: "advanced", scaffolding: "high" },
      })?.policy,
    ).toMatchObject({ explanationLevel: "advanced", scaffolding: "medium" });
  });

  it("changes nothing when both levels are already at their limit", () => {
    const current: Policy = { ...DEFAULT_POLICY, explanationLevel: "advanced", scaffolding: "low" };
    expect(evaluate([perfect(1), perfect(2), perfect(3)], { current })).toBeNull();
  });

  it("skips attempts with nothing auto-scored (only programming questions)", () => {
    const selfEval = attempt(4, [ungraded(), ungraded(), ungraded()]);
    expect(evaluate([perfect(1), perfect(2), selfEval])).toBeNull(); // only 2 scored attempts
  });

  it("respects the 3-observation gate through the attempt count it requires", () => {
    expect(evaluate([perfect(1), perfect(2), perfect(3)], { lastVersionAt: at(2) })).toBeNull();
  });
});

describe("rule priority and notes", () => {
  it("Rule B wins when the latest attempts average 80%+, even if one objective has 3 misses", () => {
    // 4 of 5 right three times in a row, always missing the same objective: 3 misses (Rule A's
    // threshold) but 80% accuracy. The student is not struggling.
    const attempts = [1, 2, 3].map((n) =>
      attempt(n, [right(), right(), right(), right(), wrong()]),
    );
    expect(evaluate(attempts)?.reasonCode).toBe("HIGH_ACCURACY");
  });

  it("a Rule B that has nothing left to change still blocks Rule A", () => {
    const attempts = [1, 2, 3].map((n) =>
      attempt(n, [right(), right(), right(), right(), wrong()]),
    );
    const current: Policy = { ...DEFAULT_POLICY, explanationLevel: "advanced", scaffolding: "low" };
    expect(evaluate(attempts, { current })).toBeNull();
  });

  it("Rule A applies when accuracy is low", () => {
    const attempts = [1, 2, 3].map((n) => attempt(n, [right(), wrong()])); // 50%, 3 misses
    expect(evaluate(attempts)?.reasonCode).toBe("REPEATED_OBJECTIVE_ERRORS");
  });

  it("states the real numbers that triggered the change", () => {
    const a = evaluate([attempt(1, [wrong(), wrong()]), attempt(2, [wrong(), right()])]);
    expect(a?.note).toBe(
      "3 greșeli la același obiectiv în ultimele 2 încercări (prag 3). Sprijin: medium → high, exemplul vine primul.",
    );

    const perfect = (minutes: number) => attempt(minutes, [right(), right(), right(), right()]);
    const b = evaluate([perfect(1), perfect(2), perfect(3)]);
    expect(b?.note).toBe(
      "Media ultimelor 3 încercări: 100% (prag 80%). Explicații: standard → avansat, sprijin: medium → low.",
    );
  });

  it("is pure: the same input gives the same output and nothing is mutated", () => {
    const attempts = [attempt(3, [wrong()]), attempt(1, [wrong()]), attempt(2, [wrong()])];
    const snapshot = structuredClone(attempts);
    const first: PolicyChange | null = evaluate(attempts);
    expect(evaluate(attempts)).toEqual(first);
    expect(attempts).toEqual(snapshot); // no sorting in place
  });

  it("is config-driven: other thresholds change the outcome", () => {
    const strict: AdaptationConfig = { ...ADAPTATION, wrongAnswersThreshold: 4 };
    expect(evaluate([attempt(1, [wrong(), wrong(), wrong()])], { config: strict })).toBeNull();
    const lenient: AdaptationConfig = {
      ...ADAPTATION,
      wrongAnswersThreshold: 2,
      minNewObservations: 2,
    };
    expect(evaluate([attempt(1, [wrong(), wrong()])], { config: lenient })?.reasonCode).toBe(
      "REPEATED_OBJECTIVE_ERRORS",
    );
  });
});
