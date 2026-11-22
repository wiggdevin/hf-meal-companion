/**
 * Fast logging: the `/log` deep link. A home-screen shortcut or any link opens
 * `/log?mode=…&slot=…`; the page (or, offline, the service worker) forwards to Today as `/?log=…`,
 * and Today opens the capture once. Pure: no window, no fetch.
 *
 * Nothing here starts a model call or commits anything. A capture it opens still proposes and
 * waits for the user to confirm (F-073).
 */
import type { CaptureMethod } from "@/lib/capture/flags";
import { SLOT_IDS } from "@/lib/coach/types";
import type { SlotId } from "@/lib/types";

export const LOG_MODES = ["voice", "photo", "label", "barcode", "text"] as const;
export type LogMode = (typeof LOG_MODES)[number];

export type LogIntent = { mode: LogMode | null; slot: SlotId | null };

/** What Today opens: one capture, the barcode ready screen, or the log sheet (search, favorites). */
export type LogOpen = { kind: "capture"; method: CaptureMethod } | { kind: "scan" } | { kind: "sheet" };

const PARAMS = ["log", "slot"] as const;

function first(value: string | string[] | undefined | null): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export function asLogMode(value: string | null | undefined): LogMode | null {
  return (LOG_MODES as readonly string[]).includes(value ?? "") ? (value as LogMode) : null;
}

export function asSlotId(value: string | null | undefined): SlotId | null {
  return (SLOT_IDS as readonly string[]).includes(value ?? "") ? (value as SlotId) : null;
}

/** The `/log` page's target. Unknown values are dropped, never forwarded. */
export function logRedirectPath(params: Record<string, string | string[] | undefined>): string {
  const mode = asLogMode(first(params.mode));
  const slot = asSlotId(first(params.slot));
  const query = new URLSearchParams({ log: mode ?? "open" });
  if (slot) query.set("slot", slot);
  return `/?${query.toString()}`;
}

/**
 * Today's read of its own address. Null when the address asks for no log. Today's shell can also
 * be served AT `/log` (an offline navigation the worker answered from its cache), so `/log`'s own
 * `mode` parameter counts there.
 */
export function parseLogIntent(search: string, pathname = "/"): LogIntent | null {
  const query = new URLSearchParams(search);
  if (pathname === "/log") {
    return { mode: asLogMode(query.get("mode")), slot: asSlotId(query.get("slot")) };
  }
  if (!query.has("log")) return null;
  return { mode: asLogMode(query.get("log")), slot: asSlotId(query.get("slot")) };
}

/** The address without the log request, so a reload or Back does not open it again. */
export function withoutLogIntent(search: string, pathname = "/"): { pathname: string; search: string } {
  const query = new URLSearchParams(search);
  for (const name of pathname === "/log" ? ["mode", "slot"] : PARAMS) query.delete(name);
  const rest = query.toString();
  return { pathname: pathname === "/log" ? "/" : pathname, search: rest ? `?${rest}` : "" };
}

/** The slot only when that day's layout has it: a link names a slot, the day decides it exists. */
export function slotOnDay(slot: SlotId | null, daySlots: readonly { slot: SlotId }[]): SlotId | null {
  return slot && daySlots.some((item) => item.slot === slot) ? slot : null;
}

/** A switched-off method falls back to something that is on: voice to the text box (it carries
 *  the dictation mic), anything else to the log sheet. */
export function resolveLogIntent(
  mode: LogMode | null,
  enabled: { methods: readonly CaptureMethod[]; scan: boolean },
): LogOpen {
  if (mode === "barcode") return enabled.scan ? { kind: "scan" } : { kind: "sheet" };
  if (!mode) return { kind: "sheet" };
  if (enabled.methods.includes(mode)) return { kind: "capture", method: mode };
  if (mode === "voice" && enabled.methods.includes("text")) return { kind: "capture", method: "text" };
  return { kind: "sheet" };
}
