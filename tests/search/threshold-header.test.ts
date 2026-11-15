import { describe, expect, it } from "vitest";
import { renderThresholds } from "@/scripts/search-eval";
import { calibrate, type LabelledQuery } from "@/lib/search/eval";
import type { FoodSearchHit } from "@/lib/server/catalog";

const label: LabelledQuery = { q: "rice", source: "off", sourceId: "1" };
const hit = (id: number, score: number): FoodSearchHit => ({
  catalogFoodId: id, revisionId: id, description: "synthetic food", brand: null,
  source: "off", qualityClass: "label", qualityFlags: [], prepState: null, score,
  prefStatus: null, policyCategories: [], policy: { verdict: "allowed" },
  kcalPer100g: null, per100g: null, portions: [], defaultPortion: null,
});

describe("generated threshold provenance", () => {
  it("an unmeasured class says FALLBACK rather than claiming successful precision calibration", () => {
    const output = renderThresholds([], []);
    expect(output).toContain("branded: FALLBACK: no grid point met MIN_PRECISION");
    expect(output).toContain("generic: FALLBACK: no grid point met MIN_PRECISION");
    expect(output).not.toContain("the smallest threshold pair that keeps");
  });

  it("a successful generic calibration does not imply evidence for the unmeasured branded class", () => {
    const output = renderThresholds([label], [[hit(1, 0.9), hit(2, 0.1)]]);
    expect(output).toContain("generic: CALIBRATED");
    expect(output).toContain("branded: FALLBACK");
    expect(output).toContain("1/1 correct");
  });

  it("does not mistake a valid grid point equal to the fallback pair for failed calibration", () => {
    // The wrong .94-score row forces minScore .95; the wrong .29-margin row forces .30.
    // Only the .95/.30 pair accepts the correct row while rejecting both wrong rows.
    const labels = [label, label, label];
    const runs = [[hit(1, 0.95), hit(2, 0.64)],
      [hit(2, 0.94), hit(1, 0.01)], [hit(2, 0.99), hit(1, 0.70)]];
    expect(calibrate(labels, runs).generic).toEqual({ minScore: 0.95, minMargin: 0.3 });
    const output = renderThresholds(labels, runs);
    expect(output).toContain("generic: CALIBRATED");
    expect(output).not.toContain("generic: FALLBACK");
    expect(output).toContain("generic: { minScore: 0.95, minMargin: 0.3 }");
  });
});
