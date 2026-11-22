/**
 * Fast logging (2026-11-21): one-tap re-log. A recent meal, a starred food or meal, or yesterday's
 * entries in the same slot are logged again at their own foods and grams, with no portion step,
 * then confirmed with Undo. Every re-log is a NEW entry through the one commit path
 * (lib/log/relog-batch.ts → lib/log/log-again.ts), so the server marks it under today's rules
 * like any other log. This file picks WHAT is re-logged and says it; the batch sends it.
 */
import { currentAccountOrNull, type AccountHandle } from "@/lib/device/account";
import type { FavoriteRow } from "@/lib/favorites";
import { canLogAgain, foodsKey, recentMeals, type RecentMeal } from "@/lib/log/recent-meals";
import { getRow } from "@/lib/sync/idb";
import type { LoggedFood, SlotId, StoredDay } from "@/lib/types";

/**
 * The foods of a saved meal (its `favorites_meals` row on this phone), which is what a starred
 * meal IS: its name can be renamed or shared by another plate, its foods cannot. Null when the row
 * is missing, deleted or unreadable.
 */
export async function savedMealRefs(
  mealId: string, h: AccountHandle | null = currentAccountOrNull(),
): Promise<string[] | null> {
  if (!h) return null;
  try {
    const row = await getRow(h, "favorites_meals", mealId) as
      { deleted_at?: unknown; items?: { food_ref_id?: unknown }[] } | undefined;
    if (!row || row.deleted_at || !Array.isArray(row.items)) return null;
    const refs = row.items.map((item) => item.food_ref_id).filter((ref): ref is string => typeof ref === "string");
    return refs.length > 0 ? refs : null;
  } catch {
    return null;
  }
}

/**
 * The entry a star re-logs: for a food, the newest single-food entry of that food ref; for a saved
 * meal, the newest entry of exactly its foods (`mealRefs`, from `savedMealRefs`). Never by name.
 * Null when nothing logged matches, and the chip then keeps its old behaviour.
 */
export function favoriteRelog(
  fav: FavoriteRow, days: Record<string, StoredDay>, mealRefs?: readonly string[] | null,
): RecentMeal | null {
  if (fav.kind === "recipe") return null;
  const all = recentMeals(days, { limit: Number.POSITIVE_INFINITY });
  if (fav.kind === "food") {
    const ref = fav.foodRefId?.toLowerCase();
    if (!ref) return null;
    return all.find(({ entry }) => entry.items?.length === 1
      && entry.items[0].food_ref_id.toLowerCase() === ref) ?? null;
  }
  if (!mealRefs || mealRefs.length === 0) return null;
  const key = foodsKey(mealRefs);
  return all.find(({ entry }) => foodsKey((entry.items ?? []).map((item) => item.food_ref_id)) === key) ?? null;
}

/** "YYYY-MM-DD" plus `days`, at noon UTC so no zone or DST shift can move it. */
export function shiftDay(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export type YesterdayInSlot = { copy: LoggedFood[]; omitted: LoggedFood[] };

/** Yesterday's entries in this slot: what a re-log can rebuild (in logged order), and what it leaves out. */
export function yesterdayInSlot(days: Record<string, StoredDay>, date: string, slot: SlotId): YesterdayInSlot {
  const all = (days[shiftDay(date, -1)]?.extras ?? []).filter((entry) => entry.slot === slot);
  return { copy: all.filter(canLogAgain), omitted: all.filter((entry) => !canLogAgain(entry)) };
}

/** The durable key of "Same as yesterday" for one day and slot (lib/log/relog-batch.ts). */
export function sameAsYesterdayKey(date: string, slot: SlotId): string {
  return `same-as-yesterday:${date}:${slot}`;
}

/** What "Same as yesterday" will copy, and what it leaves out and why, in one line. */
export function sameAsYesterdayCopy({ copy, omitted }: YesterdayInSlot): string {
  const names = (entries: LoggedFood[]) => entries.map((entry) => entry.name).join(", ");
  const copies = `Copies ${names(copy)}.`;
  return omitted.length === 0 ? copies : `${copies} Leaves out ${names(omitted)}, not saved yet or not rebuildable.`;
}

/** A recent chip's second line: the portion it logs and the day it is from. */
export function relogDetail(meal: RecentMeal, today: string): string {
  const { entry, date } = meal;
  const portion = entry.items && entry.items.length > 1
    ? `${entry.items.length} foods, ${Math.round(entry.grams)} g`
    : entry.portionLabel || `${Math.round(entry.grams)} g`;
  const day = date === today ? "today"
    : date === shiftDay(today, -1) ? "yesterday"
      : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `${portion} · ${day}`;
}
