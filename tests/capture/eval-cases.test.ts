import { describe, expect, it } from "vitest";
import { scoreCases, type CaptureCase } from "@/scripts/eval/capture-score";

const gold = (label: string, grams = 100, ids?: string[]) => ({
  label, grams, quantitySource: "weighed" as const, ...(ids ? { ids } : {}),
});
const prediction = (label: string, grams = 100, autoResolved = false, ids?: string[]) => ({
  label, grams, autoResolved, alternatives: [], ...(ids ? { ids } : {}),
});
const capture = (expectations: CaptureCase["expected"], predictions: CaptureCase["predictions"]): CaptureCase => ({
  method: "text", status: "scored", expected: expectations, predictions,
});

describe("capture case scoring", () => {
  it("matches a reordered correct draft once per item", () => {
    const score = scoreCases("text", [capture([gold("egg"), gold("rice")],
      [prediction("rice"), prediction("eggs")])]);
    expect(score.itemAccuracy).toBe(1);
    expect(score.correct).toBe(2);
    expect(score.labelOnlyMatches).toBe(2);
    expect(score.quantityN).toBe(2);
  });

  it("uses augmenting matches rather than greedily consuming an accepted ID", () => {
    const score = scoreCases("text", [capture([gold("milk", 100, ["fdc:1", "fdc:2"]),
      gold("milk", 100, ["fdc:1"])],
    [prediction("milk", 100, false, ["fdc:1"]), prediction("milk", 100, false, ["fdc:2"])])]);
    expect(score.correct).toBe(2);
    expect(score.canonicalMatches).toBe(2);
  });

  it("does not reuse one prediction for two gold items", () => {
    const score = scoreCases("text", [capture([gold("egg"), gold("egg")], [prediction("egg")])]);
    expect(score.correct).toBe(1);
    expect(score.missing).toBe(1);
    expect(score.failed).toBe(1);
    expect(score.itemAccuracy).toBe(0.5);
  });

  it("includes extra auto-resolved predictions in grounding precision", () => {
    const score = scoreCases("text", [capture([gold("egg")],
      [prediction("egg", 100, true), prediction("rice", 100, true)])]);
    expect(score.extra).toBe(1);
    expect(score.extraPerCase).toBe(1);
    expect(score.autoResolved).toBe(2);
    expect(score.autoResolvePrecision).toBe(0.5);
    expect(score.autoResolveCoverage).toBe(2);
  });

  it("does not equate automatic grounding with top-3 correctness", () => {
    const score = scoreCases("text", [capture([gold("milk")],
      [prediction("coconut milk", 100, true)])]);
    expect(score.top3Containment).toBe(0);
    expect(score.gramMae).toBeNull();
    expect(score.misidentified).toBe(1);
    expect(score.missing).toBe(0);
    expect(score.taskFailureCases).toBe(1);
  });

  it("gives top-3 credit only for a real accepted candidate among the first three", () => {
    const wrong = prediction("coconut milk", 100, false);
    const score = scoreCases("text", [capture([gold("milk", 100, ["fdc:1"])], [{
      ...wrong, alternatives: [{ label: "milk", grams: null, ids: ["fdc:2"] },
        { label: "dairy", grams: null, ids: ["fdc:1"] }],
    }])]);
    expect(score.itemAccuracy).toBe(0);
    expect(score.top3Containment).toBe(1);
  });

  it("scores quantities only with an explicit gold basis and a correct identity", () => {
    const score = scoreCases("text", [capture([
      gold("egg", 100), { label: "rice", grams: 150 }, gold("pasta", 100),
    ], [prediction("egg", 120), prediction("rice", 900), prediction("fish", 100)])]);
    expect(score.quantityN).toBe(1);
    expect(score.gramMae).toBe(20);
    expect(score.quantityMedianAbs).toBe(20);
    expect(score.quantityP90Percent).toBe(20);
    expect(score.quantityUnscored).toBe(2);
  });

  it("counts provider failures by case while retaining every gold miss", () => {
    const score = scoreCases("text", [{ method: "text", status: "provider_failure",
      expected: [gold("egg"), gold("rice")], predictions: [] }]);
    expect(score.cases.providerFailure).toBe(1);
    expect(score.cases.scored).toBe(1);
    expect(score.n).toBe(2);
    expect(score.missing).toBe(2);
    expect(score.gramMae).toBeNull();
  });

  it("keeps missing media, not-run and unlabelled cases visible without measuring identity", () => {
    const score = scoreCases("photo", [{ method: "photo", status: "media_missing",
      expected: [gold("egg")], predictions: [], mediaPresent: false },
    { method: "photo", status: "unlabelled", expected: [], predictions: [prediction("rice")], mediaPresent: true },
    { method: "photo", status: "not_run", expected: [gold("rice")], predictions: [], mediaPresent: true }]);
    expect(score.cases).toEqual({ total: 3, labelled: 2, unlabelled: 1, mediaPresent: 2,
      mediaMissing: 1, notRun: 1, providerFailure: 0, scored: 0 });
    expect(score.goldItems).toBe(2);
    expect(score.n).toBe(0);
    expect(score.itemAccuracy).toBeNull();
    expect(score.gramMae).toBeNull();
  });
});
