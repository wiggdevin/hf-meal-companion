/**
 * The zone-aware calendar clock, shared by client and server code. Plain on purpose: no
 * "use client", so a server route that imports it gets the functions, not client-reference stubs
 * (lib/coach/apply-shared.ts re-exports both for the coach applies).
 */
const DAY_MS = 86_400_000;

export function dateInZone(at: Date, tz: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(at);
  } catch { return null; }
}

/**
 * Turn a calendar date and clock time in `tz` into the instant the log contract requires. The
 * JavaScript/Temporal "compatible" rule, the same in every zone (audit A166): a repeated time (the
 * autumn fall-back hour) is its earlier instant, and a time that does not exist (the spring-forward
 * gap) is read with the offset in force before the change, so it lands that much later
 * (02:30 → 03:30) east or west of UTC alike.
 */
export function instantAt(date: string, time: string, tz: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    /** The wall clock `at` shows in `tz`, as if it were UTC. */
    const shown = (at: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(at))
        .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    };
    // The zone's offset a day either side: no zone changes its offset twice within two days.
    const before = shown(target - DAY_MS) - (target - DAY_MS);
    const after = shown(target + DAY_MS) - (target + DAY_MS);
    const earlier = target - Math.max(before, after);
    const later = target - Math.min(before, after);
    const instant = shown(earlier) === target ? earlier
      : shown(later) === target ? later
      : target - before;
    const result = new Date(instant);
    return dateInZone(result, tz) === date ? result : null;
  } catch { return null; }
}
