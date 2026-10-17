import { z } from "zod";

// A lone UTF-16 surrogate makes encodeURIComponent throw.
export function isWellFormed(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

/** Length in bytes of the UTF-8 encoding (the shared package has no Node or DOM types). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// Postgres cannot store \u0000 in text/jsonb, nor lone surrogate escapes in jsonb. Both would
// surface as a 500, so user-supplied text rejects them up front.
export const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes("\u0000"), "NUL character not allowed")
    .refine(isWellFormed, "invalid unicode (lone surrogate)");
