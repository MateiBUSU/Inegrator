import {
  authResponseSchema,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from "@app/shared";
import { request } from "./client";
import { ApiError } from "./errors";

// Auth endpoints use snake_case (display_name, teacher_secret).

/** POST /api/auth/register. Also signs the user in (the API sets the session cookie). */
export async function register(body: RegisterRequest): Promise<AuthUser> {
  const { user } = await request("POST", "/auth/register", { body, schema: authResponseSchema });
  return user;
}

/** POST /api/auth/login */
export async function login(body: LoginRequest): Promise<AuthUser> {
  const { user } = await request("POST", "/auth/login", { body, schema: authResponseSchema });
  return user;
}

/** POST /api/auth/logout (204) */
export function logout(): Promise<void> {
  return request("POST", "/auth/logout");
}

/** GET /api/auth/me. Resolves to null when nobody is signed in (401) instead of throwing. */
export async function me(): Promise<AuthUser | null> {
  try {
    const { user } = await request("GET", "/auth/me", { schema: authResponseSchema });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
