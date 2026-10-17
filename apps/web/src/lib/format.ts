const dateTime = new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium" });

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "17 oct. 2026, 13:05" (Romanian locale). Unparseable input is returned as is. */
export function formatDateTime(iso: string): string {
  const date = parse(iso);
  return date ? dateTime.format(date) : iso;
}

export function formatDate(iso: string): string {
  const date = parse(iso);
  return date ? dateOnly.format(date) : iso;
}

/**
 * Bytes as kilobytes with one decimal, rounded UP: 204800 -> "200,0 KB", 204801 -> "200,1 KB".
 * Rounding up means a size that is over a limit never reads as equal to it.
 */
export function formatKb(bytes: number): string {
  const kb = Math.ceil((bytes / 1024) * 10) / 10;
  return `${kb.toLocaleString("ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
}
