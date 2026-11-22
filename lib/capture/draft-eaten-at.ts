/**
 * When a dock capture was eaten (F-108).
 *
 * A coach `log_draft` card carries the local date it was captured on and, since F-108, the capture
 * instant (`capturedAt`) and the zone it was taken in (`capturedTz`). The barcode path takes the
 * scan's own `scannedAt`; the photo path takes the instant the photo was picked. Both keep the zone
 * the phone was in at that moment, so a rerun as a label, a reload or a trip to a new zone still
 * logs the meal at the moment it was captured, on the date it was captured.
 *
 * A legacy card (saved before F-108, with no capture time) takes the time its message was saved,
 * then now when it is still that day, and midday on its date only for an older day with neither.
 */
import { dateInZone, instantAt } from "@/lib/coach/apply-shared";

/** How far ahead of the server clock a phone's capture time may be and still count (clock skew). */
export const CAPTURE_SKEW_MS = 5 * 60_000;

const readable = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** The zone itself when the runtime knows it, else null. */
export function knownZone(tz: string | null | undefined): string | null {
  return tz && dateInZone(new Date(0), tz) !== null ? tz : null;
}

export type DraftClock = { localDate: string; capturedAt?: string; capturedTz?: string };

/** The zone a draft's times are read in: the capture's own zone, else the account's zone now. */
export function draftZone(block: DraftClock, tz: string): string | null {
  return knownZone(block.capturedTz) ?? knownZone(tz);
}

export function draftEatenAt(
  block: DraftClock, tz: string, now: Date = new Date(), messageCreatedAt?: string | null,
): Date | null {
  const zone = draftZone(block, tz);
  if (!zone) return null;
  const onDate = (at: Date | null): at is Date => at !== null && dateInZone(at, zone) === block.localDate;
  const captured = readable(block.capturedAt);
  if (onDate(captured)) return captured;
  const saved = readable(messageCreatedAt);
  if (onDate(saved)) return saved;
  if (onDate(now)) return now;
  return instantAt(block.localDate, "12:00", zone);
}

/**
 * The capture instant and zone the server stamps on a new card. The phone's own time (`at`) counts
 * when it is readable, not in the future beyond clock skew, and on the attachment's local date in
 * the attachment's zone. Otherwise the server's clock counts when it is on that date; otherwise the
 * card carries no instant and the commit falls back as for a legacy card.
 */
export function stampCapture(
  attachment: { localDate: string; tz?: string }, at: string | undefined, accountTz: string, nowMs: number,
): { capturedAt?: string; capturedTz?: string } {
  const zone = knownZone(attachment.tz) ?? knownZone(accountTz);
  if (!zone) return {};
  const fits = (instant: Date | null): instant is Date => instant !== null
    && instant.getTime() <= nowMs + CAPTURE_SKEW_MS && dateInZone(instant, zone) === attachment.localDate;
  const phone = readable(at);
  if (fits(phone)) return { capturedAt: phone.toISOString(), capturedTz: zone };
  const server = new Date(nowMs);
  if (fits(server)) return { capturedAt: server.toISOString(), capturedTz: zone };
  return { capturedTz: zone };
}
