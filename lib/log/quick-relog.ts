/**
 * Fast logging (2026-11-21): one-tap re-log. A recent meal, a starred food or meal, or yesterday's
 * entries in the same slot are logged again at their own foods and grams, with no portion step,
 * then confirmed with Undo. Every re-log is a NEW entry through the one commit path
 * (lib/log/log-again.ts), so the server marks it under today's rules like any other log.
 */
import type { ActionFeedbackNotice } from "@/components/ui/ActionFeedback";
import type { FavoriteRow } from "@/lib/favorites";
import { forgetLoggedEntry } from "@/lib/log/delete-entry";
import { logAgain } from "@/lib/log/log-again";
import { outcomeFor } from "@/lib/log/outcome";
import { canLogAgain, recentMeals, type RecentMeal } from "@/lib/log/recent-meals";
import type { LoggedFood, SlotId, StoredDay } from "@/lib/types";

/**
 * The entry a star re-logs: for a food, the newest single-food entry of that food ref; for a saved
 * meal, the newest entry logged under its name. Null when nothing logged can be rebuilt, and the
 * chip then keeps its old behaviour (the portion view, or a note).
 */
export function favoriteRelog(fav: FavoriteRow, days: Record<string, StoredDay>): RecentMeal | null {
  if (fav.kind === "recipe") return null;
  const all = recentMeals(days, { limit: Number.POSITIVE_INFINITY });
  if (fav.kind === "food") {
    const ref = fav.foodRefId?.toLowerCase();
    if (!ref) return null;
    return all.find(({ entry }) => entry.items?.length === 1
      && entry.items[0].food_ref_id.toLowerCase() === ref) ?? null;
  }
  const name = fav.name.trim().toLowerCase();
  return all.find(({ entry }) => entry.name.trim().toLowerCase() === name) ?? null;
}

/** "YYYY-MM-DD" minus one day, at noon UTC so no zone or DST shift can move it. */
function dayBefore(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/** Yesterday's entries in this slot that a re-log can rebuild, in the order they were logged. */
export function yesterdayInSlot(days: Record<string, StoredDay>, date: string, slot: SlotId): LoggedFood[] {
  return (days[dayBefore(date)]?.extras ?? []).filter((entry) => entry.slot === slot && canLogAgain(entry));
}

export type Relogged =
  | { ok: true; date: string; ids: string[]; message: string | null }
  | { ok: false; date: string | null; ids: string[]; message: string };

/**
 * Logs each entry again, one after another. `ids` are the new entries that stayed, so Undo can
 * take back exactly those. Stops at the first refusal. Null: nothing could be rebuilt or sent.
 */
export async function relogEntries(
  entries: readonly LoggedFood[], opts: { at?: Date; tz?: string; slot?: SlotId } = {},
): Promise<Relogged | null> {
  const ids: string[] = [];
  let date: string | null = null;
  let message: string | null = null;
  for (const entry of entries) {
    const done = await logAgain(entry, opts.at ?? new Date(), opts.tz, opts.slot);
    if (done === null) continue;
    const outcome = outcomeFor(done.result);
    if (!outcome.keep) return { ok: false, date, ids, message: outcome.message ?? "That did not log. Try again." };
    ids.push(done.card.id);
    date = done.date;
    message = outcome.message ?? message;
  }
  return ids.length > 0 && date !== null ? { ok: true, date, ids, message } : null;
}

let relogging = false;

/** `relogEntries` with one run at a time: a second tap while the first is saving logs nothing. */
export async function relogOnce(
  entries: readonly LoggedFood[], opts: { at?: Date; tz?: string; slot?: SlotId } = {},
): Promise<Relogged | null | "busy"> {
  if (relogging) return "busy";
  relogging = true;
  try {
    return await relogEntries(entries, opts);
  } finally {
    relogging = false;
  }
}

/** Takes back exactly the entries a re-log added (lib/log/delete-entry.ts). */
export async function undoRelog(done: Relogged): Promise<void> {
  if (done.date === null) return;
  const date = done.date;
  await Promise.all(done.ids.map((id) => forgetLoggedEntry(date, id)));
}

/** What Today's toast says after a re-log: Logged (or the server's mark), with Undo for what stayed. */
export function relogNotice(done: Relogged | null, undo: () => void): ActionFeedbackNotice {
  const action = done && done.ids.length > 0 ? { label: "Undo", action: undo } : undefined;
  if (done === null) return { tone: "error", message: "That did not log. Try again." };
  if (!done.ok) return { tone: "error", message: done.message, action };
  return { tone: done.message ? "changed" : "success", message: done.message ?? "Logged.", action };
}
