/**
 * Fast logging: a `/log` request that has to wait. When the gate sends a new account to onboarding
 * first, the address loses `?log=…`; the validated mode and slot are held here, in this tab only, and
 * Today takes them once onboarding hands over. Device-level and account-free: a mode and a slot id,
 * nothing typed by the user, and it expires after half an hour.
 */
import { asLogMode, asSlotId, type LogIntent } from "@/lib/log/log-intent";

const KEY = "smc:device:log-intent";
const TTL_MS = 30 * 60_000;

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

export function holdLogIntent(intent: LogIntent, now: number = Date.now()): void {
  try { storage()?.setItem(KEY, JSON.stringify({ mode: intent.mode, slot: intent.slot, at: now })); } catch {
    // Storage blocked: the link opens Today without the capture, as before.
  }
}

/** The held request, once: it is removed as it is read. Anything stale or malformed is dropped. */
export function takeHeldLogIntent(now: number = Date.now()): LogIntent | null {
  const store = storage();
  let raw: string | null = null;
  try { raw = store?.getItem(KEY) ?? null; store?.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const held = JSON.parse(raw) as { mode?: unknown; slot?: unknown; at?: unknown };
    if (typeof held.at !== "number" || now - held.at > TTL_MS || held.at > now) return null;
    return {
      mode: asLogMode(typeof held.mode === "string" ? held.mode : null),
      slot: asSlotId(typeof held.slot === "string" ? held.slot : null),
    };
  } catch { return null; }
}
