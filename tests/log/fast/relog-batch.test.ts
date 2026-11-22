/**
 * Fast logging (2026-11-21): a re-log tap as a batch with a receipt per entry. One frozen instant,
 * zone and account per batch; failures never hide what logged; a retry sends only what is left,
 * under the same ids; "Same as yesterday" has durable ids; Undo takes back only unchanged entries,
 * under the account they logged as.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggedFood } from "@/lib/types";
import { EGG, RICE, entry, item } from "./relog-fixtures";

const state = vi.hoisted(() => ({
  days: {} as Record<string, { extras: LoggedFood[] }>,
  account: { userId: "u1", epoch: 1 },
  live: true,
}));
vi.mock("@/lib/device/account", () => ({
  accountHandle: () => state.account,
  currentAccountOrNull: () => state.account,
  isCurrent: (h: { userId: string; epoch: number }) =>
    state.live && h.userId === state.account.userId && h.epoch === state.account.epoch,
}));
vi.mock("@/lib/store", () => ({ getDay: (date: string) => state.days[date] }));
vi.mock("@/lib/log-commit-client", () => ({
  commitLogEntry: vi.fn(),
  committedEntry: (date: string, fallback: LoggedFood) =>
    state.days[date]?.extras.find((e) => e.id === fallback.id) ?? fallback,
}));
vi.mock("@/lib/log/delete-entry", () => ({ forgetLoggedEntry: vi.fn() }));

import {
  CHANGED, OTHER_ACCOUNT, UNDO_FAILED, batchMessage, canRetry, canUndo, planRelog, runRelog, undoRelog,
  type RelogBatch,
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
    expect(again.receipts[0].state).toBe("done");
    expect(state.days["2026-11-21"].extras).toHaveLength(1);
  });

  it("counts an entry another tab is posting as logged when its card is there", async () => {
    const batch = await planRelog([eggs], { at: AT, tz: "UTC" });
    const commit = vi.fn(async (req: Req, opts: Opts) => {
      state.days[req.local_date] = { extras: [{ ...opts.optimistic.entry }] };
      return { status: "owned_elsewhere" };
    });
    expect((await runRelog(batch, { commit: commit as never })).receipts[0].state).toBe("done");
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
});

