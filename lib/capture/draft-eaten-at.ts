/**
 * When a dock capture was eaten (fast logging 2026-11-21, F-108).
 *
 * A coach `log_draft` card carries the local date it was captured on and, since this change, the
 * instant the server received the capture (`capturedAt`). The log takes that instant, so a photo
 * sent at 19:40 is logged at 19:40 in the user's zone. A draft with no usable capture time (one
 * saved before this change) takes now when it is still that day, and midday on its date only when
 * it is an older day: the one case with no better clock to read.
 */
import { dateInZone, instantAt } from "@/lib/coach/apply-shared";

export function draftEatenAt(
  block: { localDate: string; capturedAt?: string }, tz: string, now: Date = new Date(),
): Date | null {
  if (dateInZone(now, tz) === null) return null;
  const captured = block.capturedAt ? new Date(block.capturedAt) : null;
  if (captured && !Number.isNaN(captured.getTime()) && dateInZone(captured, tz) === block.localDate) {
    return captured;
  }
  if (dateInZone(now, tz) === block.localDate) return now;
  return instantAt(block.localDate, "12:00", tz);
}
