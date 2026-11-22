/**
 * "Log again" (W123, T5): an earlier entry, logged as a new one now.
 *
 * A NEW entry — new entry id, new item ids, today's clock — through the one durable commit path,
 * so it is pending, retried and reconciled like any other log. Its foods and grams are the old
 * entry's; its nutrients and rule marks are the server's answer now, under the account's current
 * rules (logging marks, never refuses: ruling 2026-09-14). The old entry is never touched.
 */
import { buildCommitRequest } from "@/lib/log-client";
import { commitLogEntry, type CommitResult } from "@/lib/log-commit-client";
import { canLogAgain } from "@/lib/log/recent-meals";
import type { LoggedFood, SlotId } from "@/lib/types";

const SYNTHETIC_TITLE = "Logged meal";

/** Ids a re-log batch fixed in advance, so a retry posts the same entry, never a second one. */
export type RelogIds = { entryId: string; itemIds: readonly string[] };

/** The request and the card for a re-log, or null when the entry cannot be rebuilt as it stands.
 *  `slot`: the meal it files under ("Same as yesterday" on a card); the old entry's otherwise.
 *  `ids`: fixed ids (lib/log/relog-batch.ts); fresh random ones otherwise. */
export function logAgainRequest(entry: LoggedFood, at: Date, tz: string, slot?: SlotId, ids?: RelogIds) {
  if (!canLogAgain(entry)) return null;
  const entryId = ids?.entryId ?? crypto.randomUUID();
  const items = (entry.items ?? []).map((item, index) => ({
    ...item, id: ids?.itemIds[index] ?? crypto.randomUUID(), seq: index + 1 }));
  const req = buildCommitRequest({
    entryId, eatenAt: at, tz: tz || "UTC", slot: slot ?? entry.slot ?? "snack",
    // "Logged meal" is the name a pulled entry gets when it has none (lib/log/pulled-entry.ts):
    // stored as a title, it would stop the server and the card naming the meal from its foods.
    title: entry.name === SYNTHETIC_TITLE ? undefined : entry.name,
    items: items.map((item) => ({ id: item.id, foodRefId: item.food_ref_id,
      revision: { revision_id: null }, grams: item.grams, qty: item.qty, unit: item.unit })),
  });
  // The old card's display, under the new ids; its marks and revision are the old entry's, not
  // this one's, so they go and the server's answer sets them again.
  const card: LoggedFood = {
    id: entryId, foodId: entry.foodId, name: entry.name, slot: req.slot, portionLabel: entry.portionLabel,
    qty: entry.qty, grams: entry.grams, macros: entry.macros, items, at: req.eaten_at,
  };
  return { req, card };
}

/** Commit the re-log. `null`: nothing was sent, because the entry cannot be rebuilt. */
export async function logAgain(
  entry: LoggedFood, at: Date = new Date(), tz?: string, slot?: SlotId,
): Promise<{ result: CommitResult; date: string; card: LoggedFood } | null> {
  const built = logAgainRequest(entry, at, tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", slot);
  if (built === null) return null;
  const date = built.req.local_date;
  const result = await commitLogEntry(built.req,
    { optimistic: { date, entry: built.card }, timingPath: "meal-log" });
  return { result, date, card: built.card };
}
