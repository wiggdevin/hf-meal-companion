import { describe, expect, it, vi } from "vitest";
import { portionBand } from "@/lib/coach/portion-bands";
import { usualServing } from "@/lib/coach/actions/ground-kit";
import { groundActions } from "@/lib/coach/actions";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

const REF = "3f1b1a2c-0000-4000-8000-000000000031";
const cooked = { foodRefId: REF, name: "Oatmeal, cooked with water", brand: null,
  catalogFoodRevisionId: 31, kcalPer100g: 71, prefStatus: "eats" as const,
  allergenTags: [], category: [], portionGrams: null, portionLabel: null };

describe("plain cooked oatmeal has a cooked serving fallback", () => {
  it.each(["Oatmeal, cooked", "Oatmeal, cooked with water", "Cooked oatmeal", "Oats, cooked",
    "Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt"])(
    "%s uses the bundled one-cup 234 g reference, rounded to a 5 g step", (name) => {
      expect(portionBand(name, "starch").typical).toBe(235);
      expect(usualServing({ name, kcalPer100g: 71 })).toBe(235);
    });

  it.each(["Oats, rolled", "Oatmeal, dry", "Oatmeal, raw", "Oatmeal, uncooked",
    "Oatmeal, cooked and dry", "Oatmeal cookies, cooked", "Cooked oatmeal bar",
    "Instant oatmeal mix, cooked", "Cereals, oats, instant, prepared with water",
    "Oatmeal, cooked, raw", "Oatmeal, cooked, powder", "Oatmeal cake, cooked",
    "Oatmeal muffin, cooked", "Oatmeal dessert, cooked"])("does not change the existing band for %s", (name) => {
    expect(portionBand(name, "starch").typical).toBe(50);
  });

  it("preserves other-food rules and the existing usual-serving calorie cap", () => {
    expect(portionBand("Oatmeal, cooked with milk", "starch").typical).toBe(250);
    expect(portionBand("Oatmeal, cooked with yogurt", "starch").typical).toBe(200);
    expect(portionBand("Oatmeal granola, cooked", "starch").typical).toBe(45);
    expect(usualServing({ name: cooked.name, kcalPer100g: 400 })).toBe(100);
  });

  it.each([[undefined, null, 235], [70, null, 70], [undefined, 180, 180]] as const)(
    "preserves authoritative explicit grams and actual household portions: %s/%s", async (grams, portion, expected) => {
      const result = await groundActions("u", [{ kind: "set_slot_meal", from: "2026-11-15",
        slot: "meal-1", title: "Oatmeal", items: [{ name: "oatmeal", ...(grams ? { grams } : {}) }] }],
      EMPTY_PROFILE, { searchFoods: vi.fn(async () => [{ ...cooked, portionGrams: portion }]),
        newActionId: () => "a" });
      expect(result.actions).toMatchObject([{ kind: "set_slot_meal", items: [{ grams: expected }] }]);
      expect(result.clarifications).toEqual([]);
    });
});
