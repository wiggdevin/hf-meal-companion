/**
 * Fast logging (2026-11-21): one re-log tap as a batch with a receipt per entry.
 *
 * A tap freezes its instant, zone and account once (`planRelog`), and gives every entry its ids up
 * front. `runRelog` sends the entries that are not finished, one after another, and records each
 * answer on its own receipt, so a failure in the middle never hides what did log and a retry sends
 * only what is left, under the same ids (the commit route is idempotent on entry_id). "Same as
 * yesterday" passes a durable key: its ids are UUIDv5s of the account, the day, the slot and the
 * source entry, so a second tap or a second tab posts the same entries again, not new ones.
 *
 * `undoRelog` takes back exactly what logged, and only while each entry is still as it logged: a
 * card whose revision or contents moved since is someone's later change, and Undo refuses rather
 * than delete it.
 */
import { accountHandle, isCurrent, type AccountHandle } from "@/lib/device/account";
import { uuidV5 } from "@/lib/foods/uuid5";
import { commitLogEntry, committedEntry, type CommitResult } from "@/lib/log-commit-client";
import { forgetLoggedEntry } from "@/lib/log/delete-entry";
import { logAgainRequest } from "@/lib/log/log-again";
import { outcomeFor } from "@/lib/log/outcome";
import { commitNutritionUnchecked } from "@/lib/nutrition-display";
import { getDay } from "@/lib/store";
import type { LoggedFood, SlotId } from "@/lib/types";

const RELOG_NAMESPACE = "6f0d8c2a-3e41-4b7a-9c55-1d2e3f405162";

export type ReceiptState = "pending" | "done" | "failed" | "skipped";

export type RelogReceipt = {
  sourceId: string; entryId: string; itemIds: string[]; name: string; date: string;
  state: ReceiptState;
  /** The server revision and the contents the entry logged at: Undo's proof it is unchanged. */
  rev?: number; fingerprint?: string;
  message?: string;
  undone?: true;
};

export type RelogBatch = {
  opId: string; at: string; tz: string; slot?: SlotId; account: AccountHandle;
  sources: LoggedFood[]; receipts: RelogReceipt[];
  /** Every mark the server put on any entry of the batch, once each. */
  warnings: string[];
  nutritionUnchecked: boolean;
  /** The last Undo or Retry that could not finish, in words. */
  note?: string;
};

export type RelogDeps = {
  commit?: typeof commitLogEntry;
  forget?: typeof forgetLoggedEntry;
};

const FAILED = "That did not log. Try again.";
export const OTHER_ACCOUNT = "This was logged on another account. Sign back in to change it.";
export const CHANGED = "This meal changed after it was logged, so Undo would remove that change. Nothing was undone.";
export const UNDO_FAILED = "Undo did not finish. Try again.";

/** What an entry is, for "has it changed since it logged": its foods, amounts, name, slot, time and note. */
export function entryFingerprint(entry: LoggedFood): string {
  return JSON.stringify([
    entry.name, entry.slot ?? null, entry.note ?? null, Date.parse(entry.at),
    (entry.items ?? []).map((item) => [item.food_ref_id.toLowerCase(), item.grams, item.qty, item.unit]),
  ]);
}

function cardOn(date: string, id: string): LoggedFood | undefined {
  return getDay(date)?.extras?.find((entry) => entry.id === id);
}

/**
 * The batch for one tap, nothing sent yet. `durableKey` ("same-as-yesterday:<date>:<slot>") makes
 * the ids the same for the same account, key and source entry on every tap and in every tab.
 */
export async function planRelog(
  entries: readonly LoggedFood[],
  opts: { at?: Date; tz?: string; slot?: SlotId; durableKey?: string; account?: AccountHandle } = {},
): Promise<RelogBatch> {
  const account = opts.account ?? accountHandle();
  const at = opts.at ?? new Date();
  const tz = opts.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const opId = opts.durableKey ? `${opts.durableKey}:${account.userId}` : crypto.randomUUID();
  const id = (name: string) => opts.durableKey ? uuidV5(RELOG_NAMESPACE, name) : Promise.resolve(crypto.randomUUID());
  const receipts: RelogReceipt[] = [];
  for (const entry of entries) {
    const entryId = await id(`relog:${opId}:${entry.id}`);
    const itemIds = await Promise.all((entry.items ?? []).map((_, i) => id(`relog-item:${opId}:${entry.id}:${i}`)));
    const built = logAgainRequest(entry, at, tz, opts.slot, { entryId, itemIds });
    receipts.push({ sourceId: entry.id, entryId, itemIds, name: entry.name, date: built?.req.local_date ?? "",
      state: built ? "pending" : "skipped", message: built ? undefined : "This one cannot be logged again." });
  }
  return { opId, at: at.toISOString(), tz, slot: opts.slot, account, sources: [...entries], receipts,
    warnings: [], nutritionUnchecked: false };
}

function landed(receipt: RelogReceipt, card: LoggedFood): RelogReceipt {
  return { ...receipt, state: "done", rev: card.rev, fingerprint: entryFingerprint(card), message: undefined };
}

/** Sends every entry not yet done, in order, and keeps going past a failure. Never throws. */
export async function runRelog(batch: RelogBatch, deps: RelogDeps = {}): Promise<RelogBatch> {
  const commit = deps.commit ?? commitLogEntry;
  if (!isCurrent(batch.account)) return { ...batch, note: OTHER_ACCOUNT };
  const warnings = [...batch.warnings];
  let nutritionUnchecked = batch.nutritionUnchecked;
  const receipts: RelogReceipt[] = [];
  for (const receipt of batch.receipts) {
    if (receipt.state !== "pending" && receipt.state !== "failed") { receipts.push(receipt); continue; }
    // Logged already, by an earlier run or another tab with the same durable ids: never twice.
    const existing = cardOn(receipt.date, receipt.entryId);
    const source = batch.sources.find((entry) => entry.id === receipt.sourceId);
    if (existing) { receipts.push(landed(receipt, existing)); continue; }
    const built = source && logAgainRequest(source, new Date(batch.at), batch.tz, batch.slot,
      { entryId: receipt.entryId, itemIds: receipt.itemIds });
    if (!built) { receipts.push({ ...receipt, state: "skipped", message: "This one cannot be logged again." }); continue; }
    let result: CommitResult;
    try {
      result = await commit(built.req, { optimistic: { date: built.req.local_date, entry: built.card },
        account: batch.account, timingPath: "meal-log" });
    } catch {
      receipts.push({ ...receipt, state: "failed", message: FAILED });
      continue;
    }
    const outcome = outcomeFor(result);
    const card = cardOn(built.req.local_date, receipt.entryId);
    if (outcome.keep || (result.status === "owned_elsewhere" && card)) {
      receipts.push(landed(receipt, committedEntry(built.req.local_date, card ?? built.card)));
      if (outcome.keep && outcome.message && !warnings.includes(outcome.message)) warnings.push(outcome.message);
      nutritionUnchecked ||= commitNutritionUnchecked(result);
    } else if (result.status === "discarded") {
      receipts.push({ ...receipt, state: "skipped", message: outcome.message ?? undefined });
    } else {
      receipts.push({ ...receipt, state: "failed", message: outcome.message ?? FAILED });
    }
  }
  return { ...batch, receipts, warnings, nutritionUnchecked, note: undefined };
}

/**
 * Takes back what the batch logged, under the account it logged as. Refuses, and undoes nothing,
 * when any of those entries changed since. A failure keeps the rest for the next tap.
 */
export async function undoRelog(batch: RelogBatch, deps: RelogDeps = {}): Promise<RelogBatch> {
  const forget = deps.forget ?? forgetLoggedEntry;
  if (!isCurrent(batch.account)) return { ...batch, note: OTHER_ACCOUNT };
  const live = batch.receipts.filter((r) => r.state === "done" && !r.undone);
  const changed = live.some((r) => {
    const card = cardOn(r.date, r.entryId);
    if (!card) return false;
    const revMoved = r.rev !== undefined && card.rev !== undefined && card.rev !== r.rev;
    return revMoved || entryFingerprint(card) !== r.fingerprint;
  });
  if (changed) return { ...batch, note: CHANGED };
  const receipts: RelogReceipt[] = [];
  let note: string | undefined;
  for (const receipt of batch.receipts) {
    if (receipt.state !== "done" || receipt.undone || note) { receipts.push(receipt); continue; }
    try {
      // A card already gone was deleted by hand: there is nothing left to take back.
      if (cardOn(receipt.date, receipt.entryId)) await forget(receipt.date, receipt.entryId, batch.account);
      receipts.push({ ...receipt, undone: true });
    } catch {
      note = UNDO_FAILED;
      receipts.push(receipt);
    }
  }
  return { ...batch, receipts, note };
}

export const canUndo = (b: RelogBatch) => b.receipts.some((r) => r.state === "done" && !r.undone);
export const canRetry = (b: RelogBatch) => b.receipts.some((r) => r.state === "failed");
export const fullyUndone = (b: RelogBatch) =>
  b.receipts.some((r) => r.undone) && !canUndo(b) && !canRetry(b);

/** The batch in one line: what logged, what did not, and why. */
export function batchMessage(b: RelogBatch): string {
  const done = b.receipts.filter((r) => r.state === "done" && !r.undone);
  const failed = b.receipts.filter((r) => r.state === "failed");
  if (fullyUndone(b)) return "Undone.";
  const names = (rs: RelogReceipt[]) => rs.map((r) => r.name).join(", ");
  if (failed.length > 0 && done.length === 0) return failed[0].message ?? FAILED;
  if (done.length === 0) return b.note ?? b.receipts.find((r) => r.message)?.message ?? "Nothing was logged.";
  if (failed.length > 0) return `Logged ${names(done)}. ${names(failed)} did not log.`;
  return done.length > 1 ? `Logged ${names(done)}.` : "Logged.";
}
