/**
 * Fast logging (2026-11-21): one-tap re-log from recents, a favorite, or "Same as yesterday".
 * A re-log skips the portion step: it logs the earlier entry's own foods and grams, as a new entry,
 * through the one commit path (lib/log/log-again.ts), with Undo after.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoggedFood, LoggedItem, StoredDay } from "@/lib/types";

const commitLogEntry = vi.fn();
vi.mock("@/lib/log-commit-client", () => ({ commitLogEntry: (...args: unknown[]) => commitLogEntry(...args) }));
const forgetLoggedEntry = vi.fn(async () => undefined);
vi.mock("@/lib/log/delete-entry", () => ({ forgetLoggedEntry: (...args: unknown[]) => forgetLoggedEntry(...(args as [])) }));

import { logAgainRequest } from "@/lib/log/log-again";
import {
  favoriteRelog, relogEntries, relogNotice, relogOnce, undoRelog, yesterdayInSlot,
} from "@/lib/log/quick-relog";

const EGG = "aaaaaaaa-0000-4000-8000-000000000001";
const RICE = "aaaaaaaa-0000-4000-8000-000000000002";

function item(ref: string, grams: number): LoggedItem {
  return { id: crypto.randomUUID(), seq: 1, food_ref_id: ref, grams, qty: grams, unit: "g", snapshot: {},
    foodId: ref, name: ref, portionLabel: "g", macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
}

function entry(id: string, at: string, items: LoggedItem[], extra: Partial<LoggedFood> = {}): LoggedFood {
  return { id, foodId: "x", name: "Eggs", slot: "meal-1", portionLabel: "1", qty: 1, grams: 100,
    macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 }, items, rev: 1, at, ...extra };
}

const eggsOld = entry("e-old", "2026-11-18T08:00:00Z", [item(EGG, 100)]);
const eggsNew = entry("e-new", "2026-11-20T08:00:00Z", [item(EGG, 150)]);
const bowl = entry("bowl", "2026-11-20T13:00:00Z", [item(EGG, 50), item(RICE, 200)], { name: "Rice bowl", slot: "meal-2" });
const local = entry("local", "2026-11-20T09:00:00Z", [item(EGG, 80)], { rev: undefined });
const days: Record<string, StoredDay> = {
  "2026-11-18": { extras: [eggsOld] } as StoredDay,
  "2026-11-20": { extras: [eggsNew, bowl, local] } as StoredDay,
};

beforeEach(() => { commitLogEntry.mockReset(); forgetLoggedEntry.mockClear(); });

describe("favoriteRelog", () => {
  it("finds the newest single-food entry for a favorite food", () => {
    expect(favoriteRelog({ kind: "food", id: "f", name: "Egg", sort: 0, foodRefId: EGG.toUpperCase() }, days)?.entry.id)
      .toBe("e-new");
  });

  it("finds a favorite meal by its logged name", () => {
    expect(favoriteRelog({ kind: "meal", id: "m", name: "rice BOWL", sort: 0 }, days)?.entry.id).toBe("bowl");
  });

  it("is null when nothing logged can be rebuilt, or for a recipe", () => {
    expect(favoriteRelog({ kind: "food", id: "f", name: "Rice", sort: 0, foodRefId: RICE }, days)).toBeNull();
    expect(favoriteRelog({ kind: "food", id: "f", name: "Egg", sort: 0 }, days)).toBeNull();
    expect(favoriteRelog({ kind: "recipe", id: "r", name: "Eggs", sort: 0 }, days)).toBeNull();
  });
});

describe("yesterdayInSlot", () => {
  it("lists yesterday's re-loggable entries in the same slot", () => {
    expect(yesterdayInSlot(days, "2026-11-21", "meal-1").map((e) => e.id)).toEqual(["e-new"]);
    expect(yesterdayInSlot(days, "2026-11-21", "meal-2").map((e) => e.id)).toEqual(["bowl"]);
    expect(yesterdayInSlot(days, "2026-11-21", "meal-3")).toEqual([]);
    expect(yesterdayInSlot(days, "2026-11-20", "meal-1")).toEqual([]);
  });
});

describe("logAgainRequest's slot", () => {
  it("files the re-log in the slot asked for, else the old entry's", () => {
    const at = new Date("2026-11-21T08:00:00Z");
    expect(logAgainRequest(eggsNew, at, "UTC", "meal-3")?.req.slot).toBe("meal-3");
    expect(logAgainRequest(eggsNew, at, "UTC")?.req.slot).toBe("meal-1");
  });
});

describe("relogEntries", () => {
  it("logs each entry as a new one at the given time and slot, and returns their ids for Undo", async () => {
    commitLogEntry.mockResolvedValue({ status: "ok" });
    const at = new Date("2026-11-21T12:00:00Z");
    const done = await relogEntries([eggsNew, bowl], { at, tz: "UTC", slot: "meal-4" });
    expect(commitLogEntry).toHaveBeenCalledTimes(2);
    const [req] = commitLogEntry.mock.calls[0] as [{ slot: string; eaten_at: string; items: { grams: number }[] }];
    expect(req.slot).toBe("meal-4");
    expect(req.eaten_at).toBe(at.toISOString());
    expect(req.items.map((i) => i.grams)).toEqual([150]);
    expect(done).toMatchObject({ ok: true, date: "2026-11-21", message: null });
    if (done?.ok) expect(done.ids).toHaveLength(2);
  });

  it("says what a refusal said and keeps the ids already logged", async () => {
    commitLogEntry.mockResolvedValueOnce({ status: "ok" })
      .mockResolvedValueOnce({ status: "refused", reason: "x", message: "Nope." });
    const done = await relogEntries([eggsNew, bowl], { at: new Date("2026-11-21T12:00:00Z"), tz: "UTC" });
    expect(done?.ok).toBe(false);
    if (done && !done.ok) {
      expect(done.ids).toHaveLength(1);
      expect(done.message).toBeTruthy();
    }
  });

  it("sends nothing for an entry it cannot rebuild", async () => {
    expect(await relogEntries([local], { at: new Date(), tz: "UTC" })).toBeNull();
    expect(commitLogEntry).not.toHaveBeenCalled();
  });
});

describe("one run at a time, Undo, and the toast", () => {
  it("logs nothing on a second tap while the first is saving", async () => {
    let release: (v: unknown) => void = () => {};
    commitLogEntry.mockImplementation(() => new Promise((r) => { release = r; }));
    const first = relogOnce([eggsNew], { at: new Date("2026-11-21T12:00:00Z"), tz: "UTC" });
    expect(await relogOnce([eggsNew], { tz: "UTC" })).toBe("busy");
    release({ status: "ok" });
    expect(await first).toMatchObject({ ok: true });
    expect(commitLogEntry).toHaveBeenCalledTimes(1);
  });

  it("Undo removes exactly the entries the re-log added", async () => {
    await undoRelog({ ok: true, date: "2026-11-21", ids: ["a", "b"], message: null });
    expect(forgetLoggedEntry.mock.calls).toEqual([["2026-11-21", "a"], ["2026-11-21", "b"]]);
  });

  it("says Logged with Undo, the server's mark as a change, and a refusal as an error", () => {
    const undo = vi.fn();
    expect(relogNotice({ ok: true, date: "d", ids: ["a"], message: null }, undo))
      .toEqual({ tone: "success", message: "Logged.", action: { label: "Undo", action: undo } });
    expect(relogNotice({ ok: true, date: "d", ids: ["a"], message: "Logged, and marked." }, undo).tone).toBe("changed");
    expect(relogNotice({ ok: false, date: null, ids: [], message: "No." }, undo))
      .toEqual({ tone: "error", message: "No.", action: undefined });
    expect(relogNotice(null, undo).tone).toBe("error");
  });
});
