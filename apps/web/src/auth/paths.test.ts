import { describe, expect, it } from "vitest";
import { homePathFor, redirectTargetFor } from "./paths";

describe("homePathFor", () => {
  it("maps each role to its class list", () => {
    expect(homePathFor("teacher")).toBe("/teacher/classes");
    expect(homePathFor("student")).toBe("/student/classes");
  });
});

describe("redirectTargetFor", () => {
  it("returns to the page the guard sent the user away from, if it is in their own area", () => {
    expect(redirectTargetFor("student", "/student/progress")).toBe("/student/progress");
    expect(redirectTargetFor("teacher", "/teacher/materials/abc")).toBe("/teacher/materials/abc");
  });

  it("falls back to the role's home for the other role's area (it would only lead to /forbidden)", () => {
    expect(redirectTargetFor("student", "/teacher/classes")).toBe("/student/classes");
    expect(redirectTargetFor("teacher", "/student/progress")).toBe("/teacher/classes");
  });

  it("falls back for anything that is not a same-site path under the user's area", () => {
    for (const from of [
      undefined,
      null,
      42,
      {},
      "",
      "/",
      "/login",
      "//evil.example",
      "https://evil.example/student/x",
      "student/classes",
      "/student",
    ]) {
      expect(redirectTargetFor("student", from)).toBe("/student/classes");
    }
  });
});
