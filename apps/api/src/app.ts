import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { createAuthRouter } from "./routes/auth-routes";
import { createAttemptsRouter } from "./routes/attempts-routes";
import { createClassesRouter } from "./routes/classes-routes";
import { createClassDocumentsRouter, createDocumentsRouter } from "./routes/documents-routes";
import { healthRouter } from "./routes/health-routes";
import { createMaterialsRouter, createSubjectsRouter } from "./routes/materials-routes";
import { createMeRouter } from "./routes/me-routes";
import { createTopicsRouter } from "./routes/topics-routes";

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());

  // Mounted BEFORE the global JSON parser on purpose: the document upload route needs a larger
  // body limit (1 MB), which must apply only there and only after authentication, not to the
  // unauthenticated login/register routes. These routers parse their own bodies.
  app.use("/api/classes", createClassDocumentsRouter());

  // Default 100 KB limit for everything else.
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", createAuthRouter());
  app.use("/api/classes", createClassesRouter());
  app.use("/api/documents", createDocumentsRouter());
  app.use("/api/subjects", createSubjectsRouter());
  app.use("/api/materials", createMaterialsRouter());
  app.use("/api/attempts", createAttemptsRouter());
  app.use("/api/me/topics", createTopicsRouter());
  app.use("/api/me", createMeRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
