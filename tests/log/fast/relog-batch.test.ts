/**
 * Fast logging (2026-11-21): a re-log tap as a batch with a receipt per entry. One frozen instant,
 * zone and account per batch; failures never hide what logged; a retry sends only what is left,
 * under the same ids; "Same as yesterday" has durable ids; a tap that finds its entry already there
 * is a replay with no Undo; Undo takes back only what the batch created and only while the server
 * still holds it at the revision and day it logged at, under the account it logged as; an undone or
 * deleted durable entry gets new ids on the next tap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggedFood } from "@/lib/types";
import { EGG, RICE, entry, item } from "./relog-fixtures";

const state = vi.hoisted(() => ({
  days: {} as Record<string, { extras: LoggedFood[] }>,
  account: { userId: "u1", epoch: 1 },
  live: true,
  storage: new Map<string, string>(),
  tombstones: new Set<string>(),
  /** What the server holds per entry id; unset ids answer from the card here (rev and day). */
  server: new Map<string, { rev: number; date: string | null } | "gone" | "unreadable">(),
}));
vi.mock("@/lib/device/account", () => ({
  accountHandle: () => state.account,
  currentAccountOrNull: () => state.account,
  isCurrent: (h: { userId: string; epoch: number }) =>
    state.live && h.userId === state.account.userId && h.epoch === state.account.epoch,
}));
vi.mock("@/lib/device/account-storage", () => ({
  readAccountItem: (h: { userId: string }, name: string) => state.storage.get(`${h.userId}:${name}`) ?? null,
  writeAccountItem: (h: { userId: string }, name: string, value: string) => {
    state.storage.set(`${h.userId}:${name}`, value);
    return true;
  },
}));
vi.mock("@/lib/store", () => ({
  getDay: (date: string) => state.days[date],
  loadStore: () => ({ days: state.days }),
}));
vi.mock("@/lib/log-commit-client", () => ({
  commitLogEntry: vi.fn(),
  committedEntry: (date: string, fallback: LoggedFood) =>
    state.days[date]?.extras.find((e) => e.id === fallback.id) ?? fallback,
}));
vi.mock("@/lib/log/delete-entry", () => ({
  forgetLoggedEntry: vi.fn(),
  isDeleted: async (_h: unknown, id: string) => state.tombstones.has(id),
  readServerEntry: async (_h: unknown, id: string) => {
    const set = state.server.get(id);
    if (set) return set;
    for (const [date, day] of Object.entries(state.days)) {
      const card = day.extras.find((e) => e.id === id);
      if (card) return typeof card.rev === "number" ? { rev: card.rev, date } : "unreadable";
    }
    return "gone";
  },
}));

import {
  ALREADY, CHANGED, OTHER_ACCOUNT, TOMBSTONED, UNDO_FAILED, batchMessage, canRetry, canUndo, failedReasons,
  planRelog, runRelog, undoRelog, type RelogBatch,
} from "@/lib/log/relog-batch";

type Req = { entry_id: string; eaten_at: string; tz: string; local_date: string; slot: string; items: { id: string }[] };
type Opts = { optimistic: { date: string; entry: LoggedFood }; account: unknown };

const eggs = entry("eggs", "2026-11-20T08:00:00Z", [item(EGG, 150)]);
const bowl = entry("bowl", "2026-11-20T13:00:00Z", [item(EGG, 50), item(RICE, 200, 2)], { name: "Rice bowl" });
const toast = entry("toast", "2026-11-20T09:00:00Z", [item(RICE, 40)], { name: "Toast" });
const AT = new Date("2026-11-21T12:00:00Z");

/** A commit that writes the optimistic card, as the real one does, and answers `answer(req)`. */
function committer(answer: (req: Req) => Record<string, unknown> | Error) {
  return vi.fn(async (req: Req, opts: Opts) => {
    const out = answer(req);
    if (out instanceof Error) throw out;
    const keep = ["ok", "queued", "accepted", "conflict"].includes(String(out.status));
    if (keep) {
      const day = (state.days[opts.optimistic.date] ??= { extras: [] });
      day.extras.push({ ...opts.optimistic.entry, rev: out.status === "ok" ? 3 : undefined });
    }
    return out;
  });
}

beforeEach(() => {
  state.days = {};
  state.account = { userId: "u1", epoch: 1 };
  state.live = true;
  state.storage.clear();
  state.tombstones.clear();
  state.server.clear();
});

describe("planRelog", () => {
  it("freezes the instant, zone and account once, and records each entry's filed date", async () => {
    const batch = await planRelog([eggs, bowl], { at: AT, tz: "Pacific/Auckland", slot: "meal-2" });
    expect(batch).toMatchObject({ at: AT.toISOString(), tz: "Pacific/Auckland", slot: "meal-2",
      account: { userId: "u1", epoch: 1 } });
    // 12:00 UTC is already the 22nd in Auckland: the filed date is the zone's, frozen with the batch.
    expect(batch.receipts.map((r) => r.date)).toEqual(["2026-11-22", "2026-11-22"]);
    expect(batch.receipts.map((r) => r.state)).toEqual(["pending", "pending"]);
    expect(batch.receipts[1].itemIds).toHaveLength(2);
  });

  it("gives Same as yesterday the same ids on every tap for one account, day and slot", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const a = await planRelog([eggs, bowl], { at: AT, tz: "UTC", durableKey: key });
    const b = await planRelog([eggs, bowl], { at: new Date(AT.getTime() + 60_000), tz: "UTC", durableKey: key });
    expect(b.opId).toBe(a.opId);
    expect(b.receipts.map((r) => [r.entryId, ...r.itemIds])).toEqual(a.receipts.map((r) => [r.entryId, ...r.itemIds]));
    state.account = { userId: "u2", epoch: 2 };
    const other = await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key });
    expect(other.receipts[0].entryId).not.toBe(a.receipts[0].entryId);
    const fresh = await planRelog([eggs], { at: AT, tz: "UTC" });
    expect(fresh.receipts[0].entryId).not.toBe(a.receipts[0].entryId);
  });
});

describe("runRelog", () => {
  it("sends every entry at the frozen instant and zone, under the batch's ids and account", async () => {
    const commit = committer(() => ({ status: "ok" }));
    const batch = await planRelog([eggs, bowl], { at: AT, tz: "UTC", slot: "meal-4" });
    const done = await runRelog(batch, { commit: commit as never });
    const reqs = commit.mock.calls.map(([req]) => req);
    expect(reqs.map((r) => r.eaten_at)).toEqual([AT.toISOString(), AT.toISOString()]);
    expect(reqs.map((r) => r.tz)).toEqual(["UTC", "UTC"]);
    expect(reqs.map((r) => r.slot)).toEqual(["meal-4", "meal-4"]);
    expect(reqs.map((r) => r.entry_id)).toEqual(batch.receipts.map((r) => r.entryId));
    expect(commit.mock.calls[0][1].account).toBe(batch.account);
    expect(done.receipts.map((r) => [r.state, r.rev])).toEqual([["done", 3], ["done", 3]]);
    expect(batchMessage(done)).toBe("Logged Eggs, Rice bowl.");
  });

  it("keeps going past a failure, keeps every receipt, and a retry sends only what is left with the same ids", async () => {
    let refuse = true;
    const commit = committer((req) => (refuse && req.items.length === 2
      ? { status: "refused", reason: "x", message: "No." } : { status: "ok" }));
    const batch = await planRelog([eggs, bowl, toast], { at: AT, tz: "UTC" });
    const first = await runRelog(batch, { commit: commit as never });
    expect(first.receipts.map((r) => r.state)).toEqual(["done", "failed", "done"]);
    expect(first.receipts[1].message).toBe("The server would not take that one. Try again.");
    expect(batchMessage(first)).toBe("Logged Eggs, Toast. Rice bowl did not log.");
    expect(canRetry(first) && canUndo(first)).toBe(true);
    refuse = false;
    commit.mockClear();
    const second = await runRelog(first, { commit: commit as never });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0].entry_id).toBe(batch.receipts[1].entryId);
    expect(commit.mock.calls[0][0].items.map((i) => i.id)).toEqual(batch.receipts[1].itemIds);
    expect(commit.mock.calls[0][0].eaten_at).toBe(AT.toISOString());
    expect(second.receipts.map((r) => r.state)).toEqual(["done", "done", "done"]);
    expect(canRetry(second)).toBe(false);
  });

  it("records a thrown commit as failed without losing the others", async () => {
    const commit = committer((req) => (req.items.length === 2 ? new Error("network") : { status: "ok" }));
    const done = await runRelog(await planRelog([bowl, eggs], { at: AT, tz: "UTC" }), { commit: commit as never });
    expect(done.receipts.map((r) => r.state)).toEqual(["failed", "done"]);
  });

  it("never posts an entry that is already on the day (an earlier run, or another tab with the same durable ids)", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const commit = committer(() => ({ status: "ok" }));
    await runRelog(await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key }), { commit: commit as never });
    commit.mockClear();
    const again = await runRelog(await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key }), { commit: commit as never });
    expect(commit).not.toHaveBeenCalled();
    // A replay: logged, but this tap created nothing, so it has no Undo of its own.
    expect(again.receipts[0].state).toBe("replayed");
    expect(again.receipts[0].rev).toBeUndefined();
    expect(canUndo(again)).toBe(false);
    expect(batchMessage(again)).toBe(ALREADY);
    expect(state.days["2026-11-21"].extras).toHaveLength(1);
  });

  it("finds an existing entry an edit moved to another day, and replays it there", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const first = await runRelog(await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key }),
      { commit: committer(() => ({ status: "ok" })) as never });
    const card = state.days["2026-11-21"].extras.pop()!;
    state.days["2026-11-19"] = { extras: [{ ...card, rev: 5 }] };
    const commit = committer(() => ({ status: "ok" }));
    const again = await runRelog(await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key }), { commit: commit as never });
    expect(commit).not.toHaveBeenCalled();
    expect(again.receipts[0]).toMatchObject({ state: "replayed", date: "2026-11-19" });
    expect(first.receipts[0].state).toBe("done");
  });

  it("counts a server replay (the entry was there already) as logged with no Undo", async () => {
    const commit = committer(() => ({ status: "ok", replayed: true }));
    const done = await runRelog(await planRelog([eggs], { at: AT, tz: "UTC" }), { commit: commit as never });
    expect(done.receipts[0].state).toBe("replayed");
    expect(canUndo(done)).toBe(false);
  });

  it("stops at an account change in the middle of a batch and sends nothing more", async () => {
    let n = 0;
    const commit = committer(() => {
      n += 1;
      if (n === 1) state.live = false;
      return { status: "ok" };
    });
    const done = await runRelog(await planRelog([eggs, bowl, toast], { at: AT, tz: "UTC" }), { commit: commit as never });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(done.receipts.map((r) => r.state)).toEqual(["done", "pending", "pending"]);
    expect(done.note).toBe(OTHER_ACCOUNT);
  });

  it("lists each entry that did not log with its own reason", async () => {
    const commit = committer((req) => (req.items.length === 2
      ? { status: "refused", reason: "x", message: "No." } : new Error("network")));
    const done = await runRelog(await planRelog([bowl, eggs], { at: AT, tz: "UTC" }), { commit: commit as never });
    expect(failedReasons(done)).toEqual([
      { name: "Rice bowl", message: "The server would not take that one. Try again." },
      { name: "Eggs", message: "That did not log. Try again." },
    ]);
  });

  it("counts an entry another tab is posting as logged when its card is there", async () => {
    const batch = await planRelog([eggs], { at: AT, tz: "UTC" });
    const commit = vi.fn(async (req: Req, opts: Opts) => {
      state.days[req.local_date] = { extras: [{ ...opts.optimistic.entry }] };
      return { status: "owned_elsewhere" };
    });
    const done = await runRelog(batch, { commit: commit as never });
    expect(done.receipts[0].state).toBe("replayed");
    expect(canUndo(done)).toBe(false);
  });

  it("aggregates every entry's marks and nutrition_unchecked instead of keeping the last", async () => {
    const answers = [
      { status: "ok", flagged: [{ path: "items.0", message: "blocked:gluten" }] },
      { status: "ok", nutrition_unchecked: true },
      { status: "ok", flagged: [{ path: "items.0", message: "blocked:gluten" }] },
      { status: "ok" },
    ];
    let n = 0;
    const commit = committer(() => answers[n++]);
    const done = await runRelog(await planRelog([eggs, bowl, toast, eggs], { at: AT, tz: "UTC" }), { commit: commit as never });
    expect(done.warnings).toHaveLength(1);
    expect(done.warnings[0]).toMatch(/off-plan/);
    expect(done.nutritionUnchecked).toBe(true);
  });

  it("sends nothing once the account changed", async () => {
    const commit = committer(() => ({ status: "ok" }));
    const batch = await planRelog([eggs], { at: AT, tz: "UTC" });
    state.live = false;
    const done = await runRelog(batch, { commit: commit as never });
    expect(commit).not.toHaveBeenCalled();
    expect(done.note).toBe(OTHER_ACCOUNT);
    expect(batchMessage(done)).toBe(OTHER_ACCOUNT);
  });
});

describe("undoRelog", () => {
  async function logged(entries = [eggs, bowl]): Promise<RelogBatch> {
    return runRelog(await planRelog(entries, { at: AT, tz: "UTC" }), { commit: committer(() => ({ status: "ok" })) as never });
  }
  const forgetting = () => vi.fn(async (date: string, id: string) => {
    state.days[date].extras = state.days[date].extras.filter((e) => e.id !== id);
  });

  it("takes back exactly what logged, under the batch's account", async () => {
    const batch = await logged();
    const forget = forgetting();
    const undone = await undoRelog(batch, { forget: forget as never });
    expect(forget.mock.calls).toEqual(batch.receipts.map((r) => [r.date, r.entryId, batch.account]));
    expect(canUndo(undone)).toBe(false);
    expect(batchMessage(undone)).toBe("Undone.");
  });

  it("refuses, and undoes nothing, when an entry's revision moved since it logged", async () => {
    const batch = await logged();
    state.days["2026-11-21"].extras[1] = { ...state.days["2026-11-21"].extras[1], rev: 4 };
    const forget = forgetting();
    const out = await undoRelog(batch, { forget: forget as never });
    expect(forget).not.toHaveBeenCalled();
    expect(out.note).toBe(CHANGED);
    expect(canUndo(out)).toBe(true);
  });

  it("refuses when an entry's contents changed without a revision to show it", async () => {
    const batch = await runRelog(await planRelog([eggs], { at: AT, tz: "UTC" }),
      { commit: committer(() => ({ status: "queued" })) as never });
    expect(batch.receipts[0].rev).toBeUndefined();
    const card = state.days["2026-11-21"].extras[0];
    state.days["2026-11-21"].extras[0] = { ...card, items: card.items?.map((i) => ({ ...i, grams: 300 })) };
    expect((await undoRelog(batch, { forget: forgetting() as never })).note).toBe(CHANGED);
  });

  it("refuses under another account", async () => {
    const batch = await logged();
    state.live = false;
    const forget = forgetting();
    expect((await undoRelog(batch, { forget: forget as never })).note).toBe(OTHER_ACCOUNT);
    expect(forget).not.toHaveBeenCalled();
  });

  it("says a failed Undo and keeps the rest for the next tap", async () => {
    const batch = await logged();
    const forget = forgetting();
    forget.mockRejectedValueOnce(new Error("idb"));
    const first = await undoRelog(batch, { forget: forget as never });
    expect(first.note).toBe(UNDO_FAILED);
    expect(canUndo(first)).toBe(true);
    const second = await undoRelog(first, { forget: forget as never });
    expect(second.note).toBeUndefined();
    expect(canUndo(second)).toBe(false);
    expect(state.days["2026-11-21"].extras).toHaveLength(0);
  });

  it("skips a card deleted by hand", async () => {
    const batch = await logged([eggs]);
    state.days["2026-11-21"].extras = [];
    const forget = forgetting();
    const out = await undoRelog(batch, { forget: forget as never });
    expect(forget).not.toHaveBeenCalled();
    expect(canUndo(out)).toBe(false);
  });

  it("refuses when the server holds a later revision than the one it created (an edit elsewhere)", async () => {
    const batch = await logged([eggs]);
    state.server.set(batch.receipts[0].entryId, { rev: 7, date: "2026-11-21" });
    const forget = forgetting();
    const out = await undoRelog(batch, { forget: forget as never });
    expect(forget).not.toHaveBeenCalled();
    expect(out.note).toBe(CHANGED);
  });

  it("refuses when the server filed the entry under another day (a move elsewhere)", async () => {
    const batch = await logged([eggs]);
    state.server.set(batch.receipts[0].entryId, { rev: 3, date: "2026-11-18" });
    const forget = forgetting();
    expect((await undoRelog(batch, { forget: forget as never })).note).toBe(CHANGED);
    expect(forget).not.toHaveBeenCalled();
  });

  it("refuses when the card here moved to another day, rather than calling it already undone", async () => {
    const batch = await logged([eggs]);
    const card = state.days["2026-11-21"].extras.pop()!;
    state.days["2026-11-18"] = { extras: [card] };
    const forget = forgetting();
    expect((await undoRelog(batch, { forget: forget as never })).note).toBe(CHANGED);
    expect(forget).not.toHaveBeenCalled();
  });

  it("refuses, to try again, when the server cannot say what it holds", async () => {
    const batch = await logged([eggs]);
    state.server.set(batch.receipts[0].entryId, "unreadable");
    const forget = forgetting();
    const out = await undoRelog(batch, { forget: forget as never });
    expect(out.note).toBe(UNDO_FAILED);
    expect(forget).not.toHaveBeenCalled();
    expect(canUndo(out)).toBe(true);
  });

  it("gives a durable entry new ids after Undo, so the next tap never posts into the tombstone", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const commit = committer(() => ({ status: "ok" }));
    const first = await runRelog(await planRelog([eggs, toast], { at: AT, tz: "UTC", durableKey: key }), { commit: commit as never });
    const undone = await undoRelog(first, { forget: forgetting() as never });
    expect(batchMessage(undone)).toBe("Undone.");
    // Persisted per account: a reload or another tab plans from the same storage.
    const next = await planRelog([eggs, toast], { at: AT, tz: "UTC", durableKey: key });
    expect(next.opId).not.toBe(first.opId);
    expect(next.receipts.map((r) => r.entryId)).not.toContain(first.receipts[0].entryId);
    expect(next.receipts.map((r) => r.entryId)).not.toContain(first.receipts[1].entryId);
    commit.mockClear();
    const again = await runRelog(next, { commit: commit as never });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(canUndo(again)).toBe(true);
    // Another account starts from its own generation.
    state.account = { userId: "u2", epoch: 2 };
    const other = await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key });
    expect(other.receipts[0].generation).toBe(0);
  });

  it("gives only the deleted source new ids when the server answers with a tombstone", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const first = await runRelog(await planRelog([eggs, toast], { at: AT, tz: "UTC", durableKey: key }),
      { commit: committer(() => ({ status: "ok" })) as never });
    // Toast deleted by hand, and that delete settled: the card is gone and the server holds a tombstone.
    const toastId = first.receipts[1].entryId;
    state.days["2026-11-21"].extras = state.days["2026-11-21"].extras.filter((e) => e.id !== toastId);
    const tomb = vi.fn(async () => ({ status: "discarded" }));
    const replay = await runRelog(await planRelog([eggs, toast], { at: AT, tz: "UTC", durableKey: key }), { commit: tomb as never });
    expect(replay.receipts.map((r) => r.state)).toEqual(["replayed", "skipped"]);
    expect(replay.receipts[1].message).toBe(TOMBSTONED);
    const next = await planRelog([eggs, toast], { at: AT, tz: "UTC", durableKey: key });
    expect(next.receipts[0].entryId).toBe(first.receipts[0].entryId);
    expect(next.receipts[1].entryId).not.toBe(toastId);
  });

  it("skips past a durable id this device holds as a tombstone already", async () => {
    const key = "same-as-yesterday:2026-11-21:meal-1";
    const a = await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key });
    state.tombstones.add(a.receipts[0].entryId);
    const b = await planRelog([eggs], { at: AT, tz: "UTC", durableKey: key });
    expect(b.receipts[0].entryId).not.toBe(a.receipts[0].entryId);
    expect(b.receipts[0].generation).toBe(1);
  });
});
