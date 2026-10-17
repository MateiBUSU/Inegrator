import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts a valid response", () => {
    const parsed = healthResponseSchema.parse({ status: "ok", time: new Date().toISOString() });
    expect(parsed.status).toBe("ok");
  });

  it("rejects a wrong status or missing time", () => {
    expect(healthResponseSchema.safeParse({ status: "down", time: "now" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: "ok" }).success).toBe(false);
  });
});
