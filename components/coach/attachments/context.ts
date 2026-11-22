import { slotForNow } from "@/lib/capture-client";
import { localDate } from "@/lib/coach/chat-state";
import { resolveDay } from "@/lib/resolve";
import { loadStore } from "@/lib/store";
import type { SlotId } from "@/lib/types";

export type AttachmentMoment = { localDate: string; slot: SlotId; tz: string };

/** Use the same local date and current-slot rule as the existing capture sheet. */
export function attachmentMoment(at: Date = new Date()): AttachmentMoment {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = localDate(tz, at);
  const slots = resolveDay(loadStore(), date).slots;
  return {
    localDate: date,
    tz,
    slot: slotForNow(slots, at.getHours() * 60 + at.getMinutes()),
  };
}

/**
 * One capture's instant and the day, slot and zone read at it, frozen once at file selection (or
 * scan) and reused through the barcode read, the lookup, a "Which one?" pick and every retry, so a
 * slow lookup or a pick after midnight never moves the meal (F-108 verify round).
 */
export type CaptureInstant = { at: Date; moment: AttachmentMoment };

export function captureInstant(at: Date = new Date()): CaptureInstant {
  return { at, moment: attachmentMoment(at) };
}
