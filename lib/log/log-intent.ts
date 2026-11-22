/**
 * Fast logging (2026-11-21): the `/log` deep link. A home-screen shortcut, the share sheet or any
 * link opens `/log?mode=…&slot=…`; the page forwards to Today as `/?log=…`, and Today opens the
 * capture once. Pure: no window, no fetch.
 *
 * Nothing here starts a model call or commits anything. A capture it opens still proposes and
 * waits for the user to confirm (F-073).
 */
import type { CaptureMethod } from "@/lib/capture/flags";
import { SLOT_IDS } from "@/lib/coach/types";
import type { SlotId } from "@/lib/types";

export const LOG_MODES = ["voice", "photo", "label", "barcode", "text"] as const;
export type LogMode = (typeof LOG_MODES)[number];

export type LogIntent = { mode: LogMode | null; slot: SlotId | null; shared: boolean };

/** What Today opens: one capture, the barcode scanner, or the log sheet (search, favorites). */
export type LogOpen = { kind: "capture"; method: CaptureMethod } | { kind: "scan" } | { kind: "sheet" };

const PARAMS = ["log", "slot", "shared"] as const;

function first(value: string | string[] | undefined | null): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function asMode(value: string | undefined): LogMode | null {
  return (LOG_MODES as readonly string[]).includes(value ?? "") ? (value as LogMode) : null;
}

function asSlot(value: string | undefined): SlotId | null {
  return (SLOT_IDS as readonly string[]).includes(value ?? "") ? (value as SlotId) : null;
}

/** The `/log` page's target. Unknown values are dropped, never forwarded. */
export function logRedirectPath(params: Record<string, string | string[] | undefined>): string {
  const mode = asMode(first(params.mode));
  const slot = asSlot(first(params.slot));
  const query = new URLSearchParams({ log: mode ?? "open" });
  if (slot) query.set("slot", slot);
  if (mode === "photo" && first(params.shared) === "1") query.set("shared", "1");
  return `/?${query.toString()}`;
}

/** Today's read of its own address. Null when the address asks for no log. */
export function parseLogIntent(search: string): LogIntent | null {
  const query = new URLSearchParams(search);
  if (!query.has("log")) return null;
  const mode = asMode(query.get("log") ?? undefined);
  return { mode, slot: asSlot(query.get("slot") ?? undefined), shared: mode === "photo" && query.get("shared") === "1" };
}

/** The address without the log request, so a reload or Back does not open it again. */
export function withoutLogIntent(search: string): string {
  const query = new URLSearchParams(search);
  for (const name of PARAMS) query.delete(name);
  const rest = query.toString();
  return rest ? `?${rest}` : "";
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
