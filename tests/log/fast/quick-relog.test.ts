/**
 * Fast logging (2026-11-21): what a one-tap re-log picks and says. A star re-logs by stable
 * identity (a food ref, a saved meal's foods), never by name; "Same as yesterday" names what it
 * copies and what it leaves out; a recent chip names its portion and its day.
 */
import { describe, expect, it, vi } from "vitest";
import type { StoredDay } from "@/lib/types";
import { EGG, RICE, entry, item } from "./relog-fixtures";

const getRow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sync/idb", () => ({ getRow: (...args: unknown[]) => getRow(...args) }));

import { logAgainRequest } from "@/lib/log/log-again";
import { canLogAgain } from "@/lib/log/recent-meals";
import {
  favoriteRelog, relogDetail, sameAsYesterdayCopy, sameAsYesterdayKey, savedMealRefs, shiftDay, yesterdayInSlot,
} from "@/lib/log/quick-relog";

const eggsOld = entry("e-old", "2026-11-18T08:00:00Z", [item(EGG, 100)]);
const eggsNew = entry("e-new", "2026-11-20T08:00:00Z", [item(EGG, 150)]);
const bowl = entry("bowl", "2026-11-20T13:00:00Z", [item(EGG, 50), item(RICE, 200, 2)],
  { name: "Rice bowl", slot: "meal-2", grams: 250 });
const local = entry("local", "2026-11-20T09:00:00Z", [item(EGG, 80)], { rev: undefined, name: "Toast" });
const days: Record<string, StoredDay> = {
  "2026-11-18": { extras: [eggsOld] } as StoredDay,
  "2026-11-20": { extras: [eggsNew, bowl, local] } as StoredDay,
};
const H = { userId: "u1", epoch: 1 };

describe("favoriteRelog", () => {
  it("finds the newest single-food entry for a favorite food", () => {
    expect(favoriteRelog({ kind: "food", id: "f", name: "Egg", sort: 0, foodRefId: EGG.toUpperCase() }, days)?.entry.id)
      .toBe("e-new");
  });

  it("finds a saved meal by its foods, whatever either is called", () => {
    const fav = { kind: "meal" as const, id: "m", name: "Lunch I like", sort: 0 };
    expect(favoriteRelog(fav, days, [RICE, EGG.toUpperCase()])?.entry.id).toBe("bowl");
  });

  it("never matches a saved meal by name alone", () => {
    const fav = { kind: "meal" as const, id: "m", name: "Rice bowl", sort: 0 };
    expect(favoriteRelog(fav, days)).toBeNull();
    expect(favoriteRelog(fav, days, null)).toBeNull();
    expect(favoriteRelog(fav, days, [RICE])).toBeNull();
  });

  it("is null when nothing logged can be rebuilt, or for a recipe", () => {
    expect(favoriteRelog({ kind: "food", id: "f", name: "Rice", sort: 0, foodRefId: RICE }, days)).toBeNull();
    expect(favoriteRelog({ kind: "food", id: "f", name: "Egg", sort: 0 }, days)).toBeNull();
    expect(favoriteRelog({ kind: "recipe", id: "r", name: "Eggs", sort: 0 }, days)).toBeNull();
  });
});

describe("savedMealRefs", () => {
  it("reads the saved meal's foods from this account's row", async () => {
    getRow.mockResolvedValueOnce({ id: "m", deleted_at: null, items: [{ food_ref_id: EGG }, { food_ref_id: RICE }] });
    expect(await savedMealRefs("m", H)).toEqual([EGG, RICE]);
    expect(getRow).toHaveBeenCalledWith(H, "favorites_meals", "m");
  });

  it("is null for a deleted, missing or unreadable row, or with no account", async () => {
    getRow.mockResolvedValueOnce({ id: "m", deleted_at: "2026-11-01", items: [{ food_ref_id: EGG }] });
    expect(await savedMealRefs("m", H)).toBeNull();
    getRow.mockResolvedValueOnce(undefined);
    expect(await savedMealRefs("m", H)).toBeNull();
    getRow.mockRejectedValueOnce(new Error("idb"));
    expect(await savedMealRefs("m", H)).toBeNull();
    expect(await savedMealRefs("m", null)).toBeNull();
  });
});

describe("yesterdayInSlot", () => {
  it("splits yesterday's entries in the slot into what it copies and what it leaves out", () => {
    const meal1 = yesterdayInSlot(days, "2026-11-21", "meal-1");
    expect(meal1.copy.map((e) => e.id)).toEqual(["e-new"]);
    expect(meal1.omitted.map((e) => e.id)).toEqual(["local"]);
    expect(yesterdayInSlot(days, "2026-11-21", "meal-2").copy.map((e) => e.id)).toEqual(["bowl"]);
    expect(yesterdayInSlot(days, "2026-11-21", "meal-3")).toEqual({ copy: [], omitted: [] });
    expect(yesterdayInSlot(days, "2026-11-20", "meal-1")).toEqual({ copy: [], omitted: [] });
  });

  it("says what it copies and what it leaves out", () => {
    expect(sameAsYesterdayCopy(yesterdayInSlot(days, "2026-11-21", "meal-1")))
      .toBe("Copies Eggs. Leaves out Toast, not saved yet or not rebuildable.");
    expect(sameAsYesterdayCopy(yesterdayInSlot(days, "2026-11-21", "meal-2"))).toBe("Copies Rice bowl.");
  });

  it("has one durable key per day and slot", () => {
    expect(sameAsYesterdayKey("2026-11-21", "meal-1")).toBe("same-as-yesterday:2026-11-21:meal-1");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("refuses a date that is not a real calendar day instead of throwing or rolling over", () => {
    expect(shiftDay("2026-02-30", -1)).toBeNull();
    expect(shiftDay("not-a-date", -1)).toBeNull();
    expect(shiftDay("", -1)).toBeNull();
    expect(yesterdayInSlot(days, "garbage", "meal-1")).toEqual({ copy: [], omitted: [] });
  });
});

describe("the commit contract's limits", () => {
  it("offers no re-log the server would refuse: over 30 items, or a unit over 32 characters", () => {
    const many = entry("many", "2026-11-20T08:00:00Z", Array.from({ length: 31 }, () => item(EGG, 10)));
    expect(canLogAgain(many)).toBe(false);
    const thirty = entry("thirty", "2026-11-20T08:00:00Z", Array.from({ length: 30 }, () => item(EGG, 10)));
    expect(canLogAgain(thirty)).toBe(true);
    const long = entry("long", "2026-11-20T08:00:00Z", [{ ...item(EGG, 10), unit: "u".repeat(33) }]);
    expect(canLogAgain(long)).toBe(false);
  });

  it("never stores the synthetic \"Logged meal\" name as a title, and falls back to UTC for an empty zone", () => {
    const pulled = entry("pulled", "2026-11-20T08:00:00Z", [item(EGG, 10)], { name: "Logged meal" });
    const built = logAgainRequest(pulled, new Date("2026-11-21T12:00:00Z"), "");
    expect(built?.req.title).toBeUndefined();
    expect(built?.req.tz).toBe("UTC");
    expect(logAgainRequest(eggsNew, new Date("2026-11-21T12:00:00Z"), "UTC")?.req.title).toBe(eggsNew.name);
  });
});

describe("relogDetail", () => {
  it("names the portion and the day of a recent chip", () => {
    expect(relogDetail({ entry: eggsNew, date: "2026-11-20" }, "2026-11-21")).toBe("2 eggs · yesterday");
    expect(relogDetail({ entry: eggsNew, date: "2026-11-21" }, "2026-11-21")).toBe("2 eggs · today");
    expect(relogDetail({ entry: bowl, date: "2026-11-18" }, "2026-11-21")).toBe("2 foods, 250 g · Wed, Nov 18");
  });
});

describe("logAgainRequest", () => {
  it("files the re-log in the slot asked for, else the old entry's", () => {
    const at = new Date("2026-11-21T08:00:00Z");
    expect(logAgainRequest(eggsNew, at, "UTC", "meal-3")?.req.slot).toBe("meal-3");
    expect(logAgainRequest(eggsNew, at, "UTC")?.req.slot).toBe("meal-1");
  });

  it("uses the ids a batch fixed, so a retry posts the same entry", () => {
    const built = logAgainRequest(bowl, new Date("2026-11-21T08:00:00Z"), "UTC", undefined,
      { entryId: "entry-1", itemIds: ["item-1", "item-2"] });
    expect(built?.req.entry_id).toBe("entry-1");
    expect(built?.req.items.map((i) => i.id)).toEqual(["item-1", "item-2"]);
    expect(built?.card.id).toBe("entry-1");
  });
});
