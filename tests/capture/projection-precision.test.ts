import { describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/capture-client";
import { projectedCaptureMacros } from "@/lib/capture/preview";
import type { DraftItem } from "@/lib/capture/types";
import type { CachedRevision } from "@/lib/db/catalog-cache";

describe("capture projection precision", () => {
  it.each([[0.3, 0.15, 0.5], [0.7, 0.35, 1.1]])(
    "keeps %s + %s at snapshot precision before rounding to %s", (left, right, expected) => {
    const items: DraftItem[] = [0, 1].map((seq) => ({ seq, label: `item ${seq}`,
      foodRefId: `ref-${seq}`, catalogFoodRevisionId: seq + 1, grams: 100, qty: 100, unit: "g",
      portionId: null, confidence: 1, policy: { verdict: "allowed" }, alternatives: [], autoResolved: true }));
    const revisions = Object.fromEntries(items.map((item) => [item.seq, {
      revision_id: item.catalogFoodRevisionId, source: "label", version_label: "synthetic-gold",
      catalog_food_id: item.seq + 1, description: item.label, brand: null, portions: [],
      cached_at: "2026-11-14T00:00:00.000Z",
      per_100g: { energy_kcal: 1, protein: [left, right][item.seq], carbohydrate: 0, fat_total: 0 },
    } as CachedRevision]));
    expect(projectedCaptureMacros(applyEdits(items, {}), { proposal: { items }, revisions })?.protein).toBe(expected);
  });
  it("adds nutrient snapshots before rounding the meal display", () => {
    const items: DraftItem[] = [0, 1, 2].map((seq) => ({ seq, label: `item ${seq}`,
      foodRefId: `ref-${seq}`, catalogFoodRevisionId: seq + 1, grams: 1, qty: 1, unit: "g",
      portionId: null, confidence: 1, policy: { verdict: "allowed" }, alternatives: [], autoResolved: true }));
    const revisions = Object.fromEntries(items.map((item) => [item.seq, {
      revision_id: item.catalogFoodRevisionId, source: "label", version_label: "synthetic-gold",
      catalog_food_id: item.seq + 1, description: item.label, brand: null, portions: [],
      cached_at: "2026-11-14T00:00:00.000Z",
      per_100g: { energy_kcal: 49, protein: 4.9, carbohydrate: 4.9, fat_total: 4.9 },
    } as CachedRevision]));
    expect(projectedCaptureMacros(applyEdits(items, {}), { proposal: { items }, revisions }))
      .toEqual({ kcal: 1, protein: 0.1, carbs: 0.1, fat: 0.1 });
  });
});
