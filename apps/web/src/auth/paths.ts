import type { Role } from "@app/shared";

/** Where a signed-in user of this role lands. */
export function homePathFor(role: Role): string {
  return role === "teacher" ? "/teacher/classes" : "/student/classes";
}

/**
 * Where to go right after signing in. `from` is the page a route guard sent the person away
 * from. It is honoured only if it is a same-site absolute path under the new user's own area
 * (/teacher/... for teachers, /student/... for students); otherwise the role's home is used.
 * This avoids sending someone straight to the "forbidden" page, and avoids open redirects.
 */
export function redirectTargetFor(role: Role, from: unknown): string {
  const prefix = `/${role}/`;
  return typeof from === "string" && from.startsWith(prefix) ? from : homePathFor(role);
}
