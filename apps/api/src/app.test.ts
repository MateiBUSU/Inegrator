import request from "supertest";
import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@app/shared";
import { createApp } from "./app";

describe("GET /api/health", () => {
  it("responds 200 matching healthResponseSchema", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("returns the standard error format for unknown routes", async () => {
    const res = await request(createApp()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });
});
