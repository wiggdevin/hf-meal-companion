import { attachmentMoment, type AttachmentMoment } from "@/components/coach/attachments/context";

/**
 * One capture's instant and the day, slot and zone read at it, frozen once at file selection (or
 * scan) and reused through the barcode read, the lookup, a "Which one?" pick and every retry, so a
 * slow lookup or a pick after midnight never moves the meal (F-108 verify round). A sheet that asks
 * "Which one?" about a code read from a photo takes that photo's instant as its `captured` prop.
 */
export type CaptureInstant = { at: Date; moment: AttachmentMoment };

export function captureInstant(at: Date = new Date()): CaptureInstant {
  return { at, moment: attachmentMoment(at) };
}
