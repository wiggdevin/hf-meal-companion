"use client";

/**
 * Fast logging (2026-11-21): Today's half of the `/log` deep link (lib/log/log-intent.ts). Once the
 * page is mounted it reads `?log=…`, removes it from the address, takes a shared photo if one was
 * sent, and asks the page to open the capture. It opens a sheet only: every AI capture still
 * proposes and waits for the user to confirm (F-073).
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CaptureMethod } from "@/lib/capture/flags";
import { parseLogIntent, resolveLogIntent, withoutLogIntent, type LogOpen } from "@/lib/log/log-intent";
import { takeSharedImage } from "@/lib/log/shared-image";
import type { SlotId } from "@/lib/types";

export type LogRequest = { open: LogOpen; slot: SlotId | null; file: File | null };

export function useLogIntent(
  ready: boolean,
  enabled: { methods: readonly CaptureMethod[]; scan: boolean },
  open: (request: LogRequest) => void,
): void {
  const handled = useRef(false);
  const latest = useRef({ enabled, open });
  // A layout effect runs before every passive effect, so the read below sees this render's values.
  useLayoutEffect(() => { latest.current = { enabled, open }; });

  useEffect(() => {
    if (!ready || handled.current) return;
    handled.current = true;
    const intent = parseLogIntent(window.location.search);
    if (!intent) return;
    const url = new URL(window.location.href);
    url.search = withoutLogIntent(url.search);
    window.history.replaceState(window.history.state, "", url);
    const target = resolveLogIntent(intent.mode, latest.current.enabled);
    const shared = intent.shared && target.kind === "capture" && target.method === "photo";
    void (shared ? takeSharedImage() : Promise.resolve(null)).then((file) =>
      latest.current.open({ open: target, slot: intent.slot, file }));
  }, [ready]);
}
