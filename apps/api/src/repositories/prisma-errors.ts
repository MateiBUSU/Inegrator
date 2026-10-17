function hasCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

/** P2002 = unique constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return hasCode(err, "P2002");
}

/** P2003 = foreign key constraint violation. */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasCode(err, "P2003");
}
