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

describe("request body errors", () => {
  const login = () => request(createApp()).post("/api/auth/login");
  const notAStackTrace = (body: unknown) => {
    expect(Object.keys((body as { error: object }).error).sort()).toEqual(["code", "message"]);
  };

  it("answers 415 for an unsupported charset", async () => {
    const res = await login().set("Content-Type", "application/json; charset=nope").send("{}");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    notAStackTrace(res.body);
  });

  it("answers 415 for an unsupported content encoding", async () => {
    const res = await login()
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "compress")
      .send("{}");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("answers 400, not 500, for a body that cannot be decompressed", async () => {
    const res = await login()
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "br")
      .send("{}");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    notAStackTrace(res.body);
  });
});
