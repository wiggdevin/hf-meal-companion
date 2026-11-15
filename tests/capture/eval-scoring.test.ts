import { describe, expect, it } from "vitest";
import { renderReport, scoreMethod } from "@/scripts/ai-eval";

const result = (label: string, grams: number, expected: string, expectedGrams: number,
  autoResolved: boolean, inTop3: boolean) => ({
  expected: { label: expected, grams: expectedGrams, quantitySource: "weighed" as const },
  got: { label, grams }, autoResolved, inTop3 });

describe("scoreMethod", () => {
  it("scores item accuracy and mean absolute gram error", () => {
    const s = scoreMethod("text", [
      result("egg", 100, "egg", 90, false, true),
      result("rice", 150, "pasta", 150, false, false),
    ]);
    expect(s.n).toBe(2);
    expect(s.itemAccuracy).toBe(0.5);
    // Identity errors no longer dilute the quantity error with an unrelated food's grams.
    expect(s.gramMae).toBe(10);
    expect(s.top3Containment).toBeNull(); // Catalog top-3 needs fully canonical gold.
  });

  it("reports a null precision when nothing auto-resolved", () => {
    const s = scoreMethod("text", [result("egg", 100, "egg", 100, false, true)]);
    expect(s.autoResolved).toBe(0);
    expect(s.autoResolvePrecision).toBeNull();
  });

  it("reports precision over auto-resolved items only", () => {
    const s = scoreMethod("text", [
      result("egg", 100, "egg", 100, true, true),
      result("rice", 100, "pasta", 100, true, false),
      result("oat", 100, "oat", 100, false, true),
    ]);
    expect(s.autoResolved).toBe(2);
    expect(s.autoResolvePrecision).toBeNull(); // Labels cannot certify catalog grounding.
  });

  it("counts a failed provider call as a miss, not a dropped item", () => {
    const s = scoreMethod("text", [
      result("egg", 100, "egg", 100, false, true),
      { expected: { label: "rice", grams: 100 }, got: null, autoResolved: false, inTop3: false },
    ]);
    expect(s.n).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.itemAccuracy).toBe(0.5);
    expect(s.top3Containment).toBeNull();
    expect(s.gramMae).toBe(0);
  });

  it.each([['coconut milk', 'milk'], ['sweet potato', 'potato'], ['ricecake', 'rice'],
    ['rice cake', 'rice'], ['almond milk', 'milk'], ['oat milk', 'milk']])(
    'does not award identity credit for %s as %s', (actual, expected) => {
      expect(scoreMethod('text', [result(actual, 100, expected, 100, false, false)])
        .itemAccuracy).toBe(0);
    });

  it('does not measure quantity when no identity is correct', () => {
    const score = scoreMethod('text', [result('rice', 100, 'pasta', 100, true, false)]);
    expect(score.gramMae).toBeNull();
    expect(score.failed).toBe(1);
  });

  it('reports an unmeasured empty method', () => {
    const score = scoreMethod('photo', []);
    expect(score.itemAccuracy).toBeNull();
    expect(score.gramMae).toBeNull();
    expect(score.top3Containment).toBeNull();
  });

  it('does not fall back to labels when accepted canonical IDs are present', () => {
    const score = scoreMethod('text', [{
      expected: { label: 'milk', grams: 100, ids: ['fdc:1'] },
      got: { label: 'milk', grams: 100, ids: ['fdc:2'] },
      autoResolved: true, inTop3: false,
    }]);
    expect(score.itemAccuracy).toBe(0);
    expect(score.autoResolvePrecision).toBeNull(); // Legacy prepaired rows do not certify grounding.
  });

  it('rejects the legacy automatic-grounding shortcut as top-3 evidence', () => {
    expect(scoreMethod('text', [result('coconut milk', 100, 'milk', 100, true, true)])
      .top3Containment).toBeNull();
  });

  it.each([undefined, "unknown", "reference_portion"] as const)(
    'does not measure prepaired gram guesses with basis %s', (quantitySource) => {
      const score = scoreMethod('text', [{ expected: { label: 'egg', grams: 100, quantitySource },
        got: { label: 'egg', grams: 100 }, autoResolved: false, inTop3: false }]);
      expect(score.gramMae).toBeNull();
    });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'does not measure invalid prepaired gold grams %s', (grams) => {
      expect(scoreMethod('text', [{ expected: { label: 'egg', grams, quantitySource: 'weighed' },
        got: { label: 'egg', grams: 100 }, autoResolved: false, inTop3: false }]).gramMae).toBeNull();
    });
});

describe("renderReport", () => {
  it("prints the vacuous-precision line instead of a percentage", () => {
    const md = renderReport([scoreMethod("text", [result("egg", 100, "egg", 100, false, true)])],
      "2026-09-20");
    expect(md).toContain("0 auto-resolved of 1");
    expect(md).toContain("top-3 containment");
    expect(md).not.toMatch(/auto-resolve precision\s*\|\s*100/);
  });
});
