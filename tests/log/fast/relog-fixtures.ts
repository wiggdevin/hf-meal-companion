/** Shared entries for the fast re-log tests (tests/log/fast, tests/today). */
import type { LoggedFood, LoggedItem } from "@/lib/types";

export const EGG = "aaaaaaaa-0000-4000-8000-000000000001";
export const RICE = "aaaaaaaa-0000-4000-8000-000000000002";

export function item(ref: string, grams: number, seq = 1): LoggedItem {
  return { id: crypto.randomUUID(), seq, food_ref_id: ref, grams, qty: grams, unit: "g", snapshot: {},
    foodId: ref, name: ref === EGG ? "Egg" : "Rice", portionLabel: "g", macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
}

export function entry(id: string, at: string, items: LoggedItem[], extra: Partial<LoggedFood> = {}): LoggedFood {
  return { id, foodId: "x", name: "Eggs", slot: "meal-1", portionLabel: "2 eggs", qty: 1, grams: 100,
    macros: { kcal: 100, protein: 10, carbs: 0, fat: 5 }, items, rev: 1, at, ...extra };
}
