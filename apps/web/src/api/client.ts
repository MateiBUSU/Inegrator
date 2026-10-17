import { z } from "zod";
import { ApiError } from "./errors";

const API_BASE = "/api";

const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let onUnauthenticated: (() => void) | null = null;

/**
 * Registers what to do when the server says the session is gone in the middle of a session (a
 * 401 UNAUTHENTICATED from any endpoint except /auth/me, which is how the app asks). The auth
 * provider uses it to re-read the session so the route guards can send the user to /login.
 */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

interface RequestOptions<T> {
  body?: unknown;
  /** Validates the JSON response. Omit for endpoints that answer 204 No Content. */
  schema?: z.ZodType<T>;
}

/**
 * The single place that talks to the backend. Cookie-based auth: every request sends credentials.
 * Responses are validated with the shared zod schemas, so a mismatch between this client and the
 * API fails loudly (INVALID_RESPONSE) instead of producing silently wrong data.
 */
export async function request<T = void>(
  method: Method,
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR");
  }

  if (!response.ok) {
    // An unparseable error body (e.g. an HTML page from a proxy) still becomes an ApiError.
    let code = `HTTP_${response.status}`;
    let details: Record<string, unknown> | undefined;
    try {
      const result = errorBodySchema.safeParse(await response.json());
      if (result.success) {
        code = result.data.error.code;
        details = result.data.error.details;
      }
    } catch {
      // not JSON: keep the HTTP_<status> code
    }
    if (response.status === 401 && code === "UNAUTHENTICATED" && path !== "/auth/me") {
      onUnauthenticated?.();
    }
    throw new ApiError(response.status, code, details);
  }

  if (!options.schema) return undefined as T;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE");
  }
  const result = options.schema.safeParse(json);
  if (!result.success) throw new ApiError(response.status, "INVALID_RESPONSE");
  return result.data;
}
