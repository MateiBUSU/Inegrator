import express from "express";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountWebApp } from "./web-static";

function appWithWeb() {
  const dir = mkdtempSync(path.join(tmpdir(), "web-dist-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>spa</title>");
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  const app = express();
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  mountWebApp(app, dir);
  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND" } }));
  return app;
}

describe("mountWebApp", () => {
  it("serves built assets and falls back to index.html for client-side routes", async () => {
    const app = appWithWeb();
    expect((await request(app).get("/assets/app.js")).text).toBe("console.log(1)");
    for (const url of ["/", "/student/topics/123", "/teacher/materials/new"]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain("<title>spa</title>");
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("never swallows /api: real routes answer, unknown ones stay JSON 404s", async () => {
    const app = appWithWeb();
    expect((await request(app).get("/api/ping")).body).toEqual({ ok: true });
    const missing = await request(app).get("/api/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await request(app).post("/student/x")).status).toBe(404);
  });
});
