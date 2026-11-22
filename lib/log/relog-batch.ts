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
 * A tap that finds its entry already there (an earlier run, another tab, a reload) is a REPLAY: the
 * receipt says it is logged, and it gets no Undo, because this tap created nothing. A tap whose
 * batch is still listed resumes that batch, so the receipts that did create keep their proof.
 *
 * `undoRelog` takes back exactly what this batch created, and only while each entry is still as it
 * logged: it asks the server for the revision and day it holds now, and an entry edited, moved to
 * another day, or moved on this one is someone's later change, so Undo refuses rather than delete
 * it. A durable entry that was undone or deleted is a tombstone on the server: its source gets the
 * next generation (kept per account in storage, so every tab and every reload sees it), and the
 * next tap logs it under new ids instead of posting into the tombstone.
 */
import { accountHandle, isCurrent, type AccountHandle } from "@/lib/device/account";
import { readAccountItem, writeAccountItem } from "@/lib/device/account-storage";
import { uuidV5 } from "@/lib/foods/uuid5";
import { commitLogEntry, committedEntry, type CommitResult } from "@/lib/log-commit-client";
import { forgetLoggedEntry, isDeleted, readServerEntry } from "@/lib/log/delete-entry";
import { logAgainRequest } from "@/lib/log/log-again";
import { outcomeFor } from "@/lib/log/outcome";
import { commitNutritionUnchecked } from "@/lib/nutrition-display";
import { getDay, loadStore } from "@/lib/store";
import type { LoggedFood, SlotId } from "@/lib/types";

const RELOG_NAMESPACE = "6f0d8c2a-3e41-4b7a-9c55-1d2e3f405162";

/** `done`: this batch created it, and may Undo it. `replayed`: it was there already; no Undo. */
export type ReceiptState = "pending" | "done" | "replayed" | "failed" | "skipped";

export type RelogReceipt = {
  sourceId: string; entryId: string; itemIds: string[]; name: string; date: string;
  state: ReceiptState;
  /** Durable ids only: how many tombstones of this source came before these ids. */
  generation?: number;
  /** The server revision and the contents the entry logged at: Undo's proof it is unchanged. */
  rev?: number; fingerprint?: string;
  message?: string;
  undone?: true;
};

export type RelogBatch = {
  opId: string; at: string; tz: string; slot?: SlotId; account: AccountHandle;
  /** "Same as yesterday": the key its ids are derived from. */
  durableKey?: string;
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
  serverEntry?: typeof readServerEntry;
};

const FAILED = "That did not log. Try again.";
export const OTHER_ACCOUNT = "This was logged on another account. Sign back in to change it.";
export const CHANGED = "This meal changed after it was logged, so Undo would remove that change. Nothing was undone.";
export const UNDO_FAILED = "Undo did not finish. Try again.";
export const ALREADY = "Already logged.";
export const TOMBSTONED = "This was deleted after it logged. Tap again to log it.";
const CANNOT = "This one cannot be logged again.";

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

/** The card with this id on whatever day it is filed under now: an edit can move it off its day. */
function findCard(id: string, near: string): { date: string; card: LoggedFood } | undefined {
  const here = cardOn(near, id);
  if (here) return { date: near, card: here };
  for (const [date, day] of Object.entries(loadStore().days ?? {})) {
    const card = day?.extras?.find((entry) => entry.id === id);
    if (card) return { date, card };
  }
  return undefined;
}

const MAX_GENERATION = 50;
const generationName = (key: string, sourceId: string) => `relog-gen:${key}:${sourceId}`;

/** How many times this source's durable entry was undone or deleted, for this account. */
export function relogGeneration(h: AccountHandle, key: string, sourceId: string): number {
  const n = Number(readAccountItem(h, generationName(key, sourceId)));
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_GENERATION) : 0;
}

/** The durable entry of this source is a tombstone now: the next tap derives new ids. */
export function spendRelogGeneration(h: AccountHandle, key: string, sourceId: string, from: number): void {
  if (!isCurrent(h)) return;
  // Two tabs spending the same generation both write from + 1: one step, not two.
  const next = Math.max(relogGeneration(h, key, sourceId), from + 1);
  writeAccountItem(h, generationName(key, sourceId), String(Math.min(next, MAX_GENERATION)));
}

function idNames(base: string, sourceId: string, n: number) {
  const tail = n > 0 ? `:${n}` : "";
  return { entry: `relog:${base}:${sourceId}${tail}`, item: (i: number) => `relog-item:${base}:${sourceId}:${i}${tail}` };
}

/**
 * The batch for one tap, nothing sent yet. `durableKey` ("same-as-yesterday:<date>:<slot>") makes
 * the ids the same for the same account, key, source entry and generation on every tap and in
 * every tab. A generation whose id is a tombstone here already is skipped.
 */
export async function planRelog(
  entries: readonly LoggedFood[],
  opts: { at?: Date; tz?: string; slot?: SlotId; durableKey?: string; account?: AccountHandle } = {},
): Promise<RelogBatch> {
  const account = opts.account ?? accountHandle();
  const at = opts.at ?? new Date();
  const tz = opts.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const key = opts.durableKey;
  const base = key ? `${key}:${account.userId}` : crypto.randomUUID();
  const receipts: RelogReceipt[] = [];
  const generations: number[] = [];
  for (const entry of entries) {
    let n = key ? relogGeneration(account, key, entry.id) : 0;
    let entryId = key ? await uuidV5(RELOG_NAMESPACE, idNames(base, entry.id, n).entry) : crypto.randomUUID();
    while (key && n < MAX_GENERATION && await isDeleted(account, entryId)) {
      spendRelogGeneration(account, key, entry.id, n);
      n += 1;
      entryId = await uuidV5(RELOG_NAMESPACE, idNames(base, entry.id, n).entry);
    }
    generations.push(n);
    const names = idNames(base, entry.id, n);
    const itemIds = await Promise.all((entry.items ?? []).map((_, i) =>
      key ? uuidV5(RELOG_NAMESPACE, names.item(i)) : Promise.resolve(crypto.randomUUID())));
    const built = logAgainRequest(entry, at, tz, opts.slot, { entryId, itemIds });
    receipts.push({ sourceId: entry.id, entryId, itemIds, name: entry.name, date: built?.req.local_date ?? "",
      state: built ? "pending" : "skipped", message: built ? undefined : CANNOT, ...(key ? { generation: n } : {}) });
  }
  // One batch per set of generations: a tap after an Undo is a new batch beside the undone one.
  const opId = key && generations.some((n) => n > 0) ? `${base}#${generations.join(".")}` : base;
  return { opId, at: at.toISOString(), tz, slot: opts.slot, account, durableKey: key, sources: [...entries],
    receipts, warnings: [], nutritionUnchecked: false };
}

function landed(receipt: RelogReceipt, card: LoggedFood): RelogReceipt {
  return { ...receipt, state: "done", rev: card.rev, fingerprint: entryFingerprint(card), message: undefined };
}

/** It was there before this tap: logged, and not this batch's to take back. */
function replayed(receipt: RelogReceipt, date?: string): RelogReceipt {
  return { sourceId: receipt.sourceId, entryId: receipt.entryId, itemIds: receipt.itemIds, name: receipt.name,
    date: date ?? receipt.date, state: "replayed", message: ALREADY,
    ...(receipt.generation !== undefined ? { generation: receipt.generation } : {}) };
}

/** Sends every entry not yet done, in order, and keeps going past a failure. Never throws. */
export async function runRelog(batch: RelogBatch, deps: RelogDeps = {}): Promise<RelogBatch> {
  const commit = deps.commit ?? commitLogEntry;
  if (!isCurrent(batch.account)) return { ...batch, note: OTHER_ACCOUNT };
  const warnings = [...batch.warnings];
  let nutritionUnchecked = batch.nutritionUnchecked;
  const receipts: RelogReceipt[] = [];
  let note: string | undefined;
  for (const receipt of batch.receipts) {
    if ((receipt.state !== "pending" && receipt.state !== "failed") || note) { receipts.push(receipt); continue; }
    // Signed out or switched mid-batch: nothing more goes under the old account, or the new one.
    if (!isCurrent(batch.account)) { note = OTHER_ACCOUNT; receipts.push(receipt); continue; }
    // Logged already, by an earlier run or another tab with the same durable ids: never twice,
    // and never this tap's to Undo.
    const existing = findCard(receipt.entryId, receipt.date);
    if (existing) { receipts.push(replayed(receipt, existing.date)); continue; }
    const source = batch.sources.find((entry) => entry.id === receipt.sourceId);
    const built = source && logAgainRequest(source, new Date(batch.at), batch.tz, batch.slot,
      { entryId: receipt.entryId, itemIds: receipt.itemIds });
    if (!built) { receipts.push({ ...receipt, state: "skipped", message: CANNOT }); continue; }
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
    if (result.status === "owned_elsewhere" || (result.status === "ok" && result.replayed)) {
      // Another tab is posting it, or the server had it already: logged, not created here.
      receipts.push(card || result.status === "ok" ? replayed(receipt) : { ...receipt, state: "failed", message: FAILED });
    } else if (outcome.keep) {
      receipts.push(landed(receipt, committedEntry(built.req.local_date, card ?? built.card)));
      if (outcome.message && !warnings.includes(outcome.message)) warnings.push(outcome.message);
      nutritionUnchecked ||= commitNutritionUnchecked(result);
    } else if (result.status === "discarded") {
      // A durable id the server holds as a tombstone (an Undo or a delete): the next tap derives new ones.
      if (batch.durableKey) spendRelogGeneration(batch.account, batch.durableKey, receipt.sourceId, receipt.generation ?? 0);
      receipts.push({ ...receipt, state: "skipped", message: batch.durableKey ? TOMBSTONED : outcome.message ?? undefined });
    } else {
      receipts.push({ ...receipt, state: "failed", message: outcome.message ?? FAILED });
    }
  }
  return { ...batch, receipts, warnings, nutritionUnchecked, note };
}

type UndoCheck = "ok" | "gone" | "changed" | "unknown";

/**
 * Is this receipt's entry still exactly what this batch created? Asked of the card here AND of the
 * server: a delete is queued at whatever revision the server holds by then, so an edit made on
 * another device must be found before anything is taken off Today.
 */
async function undoCheck(batch: RelogBatch, r: RelogReceipt, read: typeof readServerEntry): Promise<UndoCheck> {
  const local = findCard(r.entryId, r.date);
  if (local && local.date !== r.date) return "changed";
  if (local) {
    const revMoved = r.rev !== undefined && local.card.rev !== undefined && local.card.rev !== r.rev;
    if (revMoved || entryFingerprint(local.card) !== r.fingerprint) return "changed";
  } else if (await isDeleted(batch.account, r.entryId)) {
    return "gone";
  }
  const server = await read(batch.account, r.entryId);
  if (server === "gone") return "gone";
  if (server === "unreadable") {
    // Never on the server yet (queued offline, no revision anywhere): the local delete is all of it.
    const unsent = local !== undefined && r.rev === undefined && typeof local.card.rev !== "number";
    return unsent ? "ok" : "unknown";
  }
  const created = r.rev ?? (typeof local?.card.rev === "number" ? local.card.rev : undefined);
  if (created !== undefined && server.rev !== created) return "changed";
  if (server.date !== null && server.date !== r.date) return "changed";
  return "ok";
}

/**
 * Takes back what the batch created, under the account it logged as. Refuses, and undoes nothing,
 * when any of those entries changed or moved since, or the server cannot say. A failure keeps the
 * rest for the next tap.
 */
export async function undoRelog(batch: RelogBatch, deps: RelogDeps = {}): Promise<RelogBatch> {
  const forget = deps.forget ?? forgetLoggedEntry;
  const read = deps.serverEntry ?? readServerEntry;
  if (!isCurrent(batch.account)) return { ...batch, note: OTHER_ACCOUNT };
  const live = batch.receipts.filter((r) => r.state === "done" && !r.undone);
  const checks = new Map<RelogReceipt, UndoCheck>();
  for (const r of live) checks.set(r, await undoCheck(batch, r, read));
  if ([...checks.values()].includes("changed")) return { ...batch, note: CHANGED };
  if ([...checks.values()].includes("unknown")) return { ...batch, note: UNDO_FAILED };
  if (!isCurrent(batch.account)) return { ...batch, note: OTHER_ACCOUNT };
  const receipts: RelogReceipt[] = [];
  let note: string | undefined;
  for (const receipt of batch.receipts) {
    const check = checks.get(receipt);
    if (!check || note) { receipts.push(receipt); continue; }
    try {
      if (!isCurrent(batch.account)) throw new Error("account changed");
      // An entry already gone was deleted by hand: there is nothing left to take back.
      if (check === "ok") await forget(receipt.date, receipt.entryId, batch.account);
      receipts.push({ ...receipt, undone: true });
      if (batch.durableKey) {
        spendRelogGeneration(batch.account, batch.durableKey, receipt.sourceId, receipt.generation ?? 0);
      }
    } catch {
      note = isCurrent(batch.account) ? UNDO_FAILED : OTHER_ACCOUNT;
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
  const done = b.receipts.filter((r) => (r.state === "done" && !r.undone) || r.state === "replayed");
  const failed = b.receipts.filter((r) => r.state === "failed");
  if (fullyUndone(b)) return "Undone.";
  const names = (rs: RelogReceipt[]) => rs.map((r) => r.name).join(", ");
  if (failed.length > 0 && done.length === 0) return failed[0].message ?? FAILED;
  if (done.length === 0) return b.note ?? b.receipts.find((r) => r.message)?.message ?? "Nothing was logged.";
  if (failed.length > 0) return `Logged ${names(done)}. ${names(failed)} did not log.`;
  if (done.every((r) => r.state === "replayed")) return ALREADY;
  return done.length > 1 ? `Logged ${names(done)}.` : "Logged.";
}

/** Each entry that did not log, with its own reason. */
export function failedReasons(b: RelogBatch): { name: string; message: string }[] {
  return b.receipts.filter((r) => r.state === "failed" || (r.state === "skipped" && r.message))
    .map((r) => ({ name: r.name, message: r.message ?? FAILED }));
}
