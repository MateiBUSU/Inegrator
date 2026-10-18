import express, { type Express } from "express";
import path from "node:path";

/**
 * Serves the built web app (Vite `dist`) from the API process, with the usual single-page-app
 * fallback: any GET that is not under /api returns index.html. Used when the API and the web app
 * share one host (see WEB_DIST_DIR); the web app calls the API with relative /api URLs, so no
 * CORS and no third-party cookies are involved. Mounted after the API routes.
 */
export function mountWebApp(app: Express, dir: string): void {
  const root = path.resolve(dir);
  // Built assets have hashed file names; index.html must always be fetched fresh.
  app.use(express.static(root, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(root, "index.html"));
  });
}
