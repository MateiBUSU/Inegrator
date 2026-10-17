import { createHash, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { AuthUser, LoginRequest, RegisterRequest } from "@app/shared";
import { env } from "../config/env";
import { HttpError } from "../middleware/error-handler";
import {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  findUserById,
  type UserRecord,
} from "../repositories/user-repository";
import { signToken } from "./token-service";

export interface AuthResult {
  user: AuthUser;
  token: string;
}

// Verified against when the email is unknown, so login takes similar time either way.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash("dummy-password-for-timing");
  return dummyHash;
}

// A malformed stored hash makes argon2.verify throw; treat it as a failed login, not a 500.
async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function toAuthUser(user: UserRecord): AuthUser {
  return { id: user.id, email: user.email, role: user.role, display_name: user.displayName };
}

function issue(user: UserRecord): AuthResult {
  return { user: toAuthUser(user), token: signToken({ userId: user.id, role: user.role }) };
}

// Hash both sides to a fixed length so timingSafeEqual never sees different sizes.
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function register(input: RegisterRequest): Promise<AuthResult> {
  if (input.role === "teacher") {
    if (!input.teacher_secret || !secretsMatch(input.teacher_secret, env.TEACHER_SECRET)) {
      throw new HttpError(403, "INVALID_TEACHER_SECRET", "Codul de profesor este invalid.");
    }
  }

  const passwordHash = await argon2.hash(input.password);
  try {
    const user = await createUser({
      email: input.email,
      passwordHash,
      role: input.role,
      displayName: input.display_name,
    });
    return issue(user);
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      throw new HttpError(409, "EMAIL_TAKEN", "Există deja un cont cu această adresă de email.");
    }
    throw err;
  }
}

export async function login(input: LoginRequest): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !valid) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Credențiale invalide.");
  }
  return issue(user);
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Autentificare necesară.");
  }
  return toAuthUser(user);
}
