import { Router } from "express";
import { healthResponseSchema } from "@app/shared";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json(healthResponseSchema.parse({ status: "ok", time: new Date().toISOString() }));
});
