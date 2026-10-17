import jwt from "jsonwebtoken";
import { z } from "zod";
import { roleSchema, type Role } from "@app/shared";
import { env } from "../config/env";

export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthContext {
  userId: string;
  role: Role;
}

const payloadSchema = z.object({ sub: z.string().uuid(), role: roleSchema });

export function signToken({ userId, role }: AuthContext): string {
  return jwt.sign({ role }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/** Returns null for any invalid, expired or malformed token. */
export function verifyToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    const payload = payloadSchema.safeParse(decoded);
    return payload.success ? { userId: payload.data.sub, role: payload.data.role } : null;
  } catch {
    return null;
  }
}
