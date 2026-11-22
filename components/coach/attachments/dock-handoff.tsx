"use client";

import { useEffect, useRef, useState } from "react";
import { CaptureStatusSheet, useCaptureUpload, type CaptureMethod } from "@/components/coach/attachments/useCaptureUpload";
import { captureInstant, type CaptureInstant } from "@/components/coach/attachments/capture-instant";
import { barcodeInPhoto, type PhotoBarcode } from "@/components/coach/attachments/photo-barcode";
import ScanAttachmentSheet from "@/components/coach/attachments/ScanAttachmentSheet";
import type { CoachAttachment } from "@/lib/coach/attachments";

/**
 * Something picked in the dock's attach tray for the coach: an image already chosen inside the
 * user's tap (iOS only opens the picker during a gesture, so the dock owns the file input and hands
 * the File over). When a chat is mounted (/coach, or the dock's chat overlay) it arrives as an event;
 * otherwise it is parked here until one mounts. Module state: it survives a client-side navigation,
 * never a reload, and is never written to the URL or storage.
 */
export type DockIntent = { kind: CaptureMethod; file: File };

export const COACH_DOCK_ATTACH_EVENT = "coach:dock-attach";

let pendingIntent: DockIntent | null = null;

export function queueDockIntent(intent: DockIntent): void {
  pendingIntent = intent;
}

/** Hands an intent to a mounted chat, or parks it for the next one. A listener marks the event's
 *  `detail.received`, so a chat that is still opening (the overlay resuming its thread) never
 *  loses the photo. */
export function deliverDockIntent(intent: DockIntent): void {
  const detail: DockIntent & { received?: boolean } = { ...intent };
  window.dispatchEvent(new CustomEvent(COACH_DOCK_ATTACH_EVENT, { detail }));
  if (!detail.received) queueDockIntent(intent);
}

export function useDockIntents(handle: (intent: DockIntent) => void, ready: boolean): void {
  const latest = useRef(handle);
  useEffect(() => { latest.current = handle; }, [handle]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<DockIntent & { received?: boolean }>).detail;
      if (!detail || typeof detail !== "object" || !("kind" in detail)) return;
      detail.received = true;
      latest.current({ kind: detail.kind, file: detail.file });
    };
    window.addEventListener(COACH_DOCK_ATTACH_EVENT, receive);
    return () => window.removeEventListener(COACH_DOCK_ATTACH_EVENT, receive);
  }, []);

  useEffect(() => {
    if (!ready || pendingIntent === null) return;
    const intent = pendingIntent;
    pendingIntent = null;
    latest.current(intent);
  }, [ready]);
}

/**
 * Mounted in the coach's toolbar: the image the dock handed over goes into this thread. With the
 * barcode capability on, a photo is first read for a barcode (photo-barcode.ts, U18): a known
 * product goes in as a barcode, several products ask which one, anything else uploads the photo.
 */
export function DockIntentReceiver({ ready, onAttachment, scanEnabled = false, readBarcode = barcodeInPhoto }: {
  ready: boolean;
  onAttachment: (attachment: CoachAttachment, optimisticText: string) => void | Promise<boolean>;
  scanEnabled?: boolean;
  readBarcode?: (file: Blob, deps?: { captured?: CaptureInstant }) => Promise<PhotoBarcode>;
}) {
  const capture = useCaptureUpload(onAttachment);
  const [choice, setChoice] = useState<Extract<PhotoBarcode, { kind: "choose" }> | null>(null);
  async function receive(intent: DockIntent, captured: CaptureInstant): Promise<void> {
    if (scanEnabled && intent.kind === "photo") {
      capture.reading();
      const found = await readBarcode(intent.file, { captured });
      if (found.kind === "gone") { capture.dismiss(); return; }
      if (found.kind === "product") { capture.dismiss(); void onAttachment(found.attachment, found.text); return; }
      if (found.kind === "choose") { capture.dismiss(); setChoice(found); return; }
    }
    await capture.upload(intent.file, intent.kind, captured);
  }
  // Grok audit 2026-10-02, finding 4: the deleted CameraAttachmentButton reopened its own file
  // input on retry; its input now lives on the dock's camera/upload tiles instead (an iOS picker
  // only opens inside the user's own tap, so this receiver cannot reopen it from here), so retry
  // just re-runs the same upload for the file the dock already handed over.
  // The instant is frozen when the dock hands the file over, and the retry reuses it (F-108).
  const lastIntent = useRef<{ intent: DockIntent; captured: CaptureInstant } | null>(null);
  useDockIntents((intent) => {
    const captured = captureInstant();
    lastIntent.current = { intent, captured };
    void receive(intent, captured);
  }, ready);
  return <>
    <CaptureStatusSheet status={capture.status} onDismiss={capture.dismiss}
      onRetry={() => {
        const last = lastIntent.current;
        if (last) void capture.upload(last.intent.file, last.intent.kind, last.captured);
      }} />
    {choice && <ScanAttachmentSheet key={choice.response.gtin14} open initialChoice={choice.response}
      captured={choice.captured} onClose={() => setChoice(null)} onAttachment={onAttachment} />}
  </>;
}

/**
 * The barcode sheet `/coach?open=scan` opens (app/scan/page.tsx's shortcut). The dock no longer has
 * a Scan tile (U18, 2026-10-04): its Camera reads a barcode out of the photo instead.
 */
export function DockScanReceiver({ open, onClose, onAttachment, onSearchManually, now }: {
  open: boolean;
  onClose: () => void;
  onAttachment: (attachment: CoachAttachment, optimisticText: string) => void | Promise<boolean>;
  onSearchManually?: (description: string) => void;
  now?: () => Date;
}) {
  return <ScanAttachmentSheet open={open} onClose={onClose} onAttachment={onAttachment}
    onSearchManually={onSearchManually} now={now} />;
}
