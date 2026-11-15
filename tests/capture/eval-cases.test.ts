import { describe, expect, it } from "vitest";
import { identityTier, scoreCases, type CaptureCase } from "@/scripts/eval/capture-score";

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
    const score = scoreCases("text", [capture([gold("egg", 100, ["fdc:egg"])],
      [prediction("egg", 100, true, ["fdc:egg"]), prediction("rice", 100, true, ["fdc:rice"])])]);
    expect(score.extra).toBe(1);
    expect(score.extraPerCase).toBe(1);
    expect(score.autoResolved).toBe(2);
    expect(score.autoResolvePrecision).toBe(0.5);
    expect(score.autoResolveCoverage).toBe(2);
  });

  it("does not equate automatic grounding with top-3 correctness", () => {
    const score = scoreCases("text", [capture([gold("milk")],
      [prediction("coconut milk", 100, true)])]);
    expect(score.top3Containment).toBeNull(); // No canonical gold for the automatic catalog choice.
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
      mediaMissing: 1, notRun: 1, providerFailure: 0, serviceUnavailable: 0, scored: 0 });
    expect(score.goldItems).toBe(2);
    expect(score.n).toBe(0);
    expect(score.itemAccuracy).toBeNull();
    expect(score.gramMae).toBeNull();
  });

  it("does not certify a grounded catalog identity from the model's original label", () => {
    const score = scoreCases("text", [capture([gold("milk")],
      [prediction("milk", 100, true, ["fdc:coconut-milk"])])]);
    expect(score.itemAccuracy).toBe(1); // Extraction label and catalog grounding are separate dimensions.
    expect(score.autoResolvePrecision).toBeNull();
    expect(score.autoResolveCoverage).toBeNull();
    expect(score.top3Containment).toBeNull();
    expect(score.top3N).toBe(0);
    expect(score.canonicalIncomplete).toBe(1);
  });

  it("abstains from canonical grounding metrics for an incompletely adjudicated case", () => {
    const score = scoreCases("text", [capture([gold("egg", 100, ["fdc:egg"]), gold("rice")],
      [prediction("egg", 100, true, ["fdc:egg"]), prediction("rice", 100, true, ["fdc:rice"])])]);
    expect(score.autoResolved).toBe(2);
    expect(score.autoResolvePrecision).toBeNull();
  });

  it("moves a canonical owner to another accepted ID to make room for label-only gold", () => {
    const score = scoreCases("text", [capture([gold("milk", 100, ["fdc:1", "fdc:2"]), gold("skim milk")],
      [prediction("skim milk", 100, false, ["fdc:1"]), prediction("whole milk", 100, false, ["fdc:2"])])]);
    expect(score.correct).toBe(2);
    expect(score.canonicalMatches).toBe(1);
    expect(score.labelOnlyMatches).toBe(1);
  });

  it("measures automatic predictions independently from arbitrary manual-duplicate assignment", () => {
    const expected = [gold("egg", 100, ["fdc:egg"])];
    const plain = prediction("egg", 100, false, ["fdc:egg"]);
    const automatic = prediction("egg", 100, true, ["fdc:egg"]);
    const first = scoreCases("text", [capture(expected, [plain, automatic])]);
    const reversed = scoreCases("text", [capture(expected, [automatic, plain])]);
    expect(first).toEqual(reversed);
    expect(first.autoResolvePrecision).toBe(1);
    expect(first.quantityN).toBe(0);
  });

  it("does not award two automatic duplicates the same canonical gold", () => {
    const score = scoreCases("text", [capture([gold("egg", 100, ["fdc:egg"])],
      [prediction("egg", 100, true, ["fdc:egg"]), prediction("egg", 200, true, ["fdc:egg"])])]);
    expect(score.autoResolvePrecision).toBe(0.5);
    expect(score.quantityN).toBe(0);
  });

  it("does not select a duplicate identity's quantity by closeness to gold", () => {
    const score = scoreCases("text", [capture([gold("egg", 100)],
      [prediction("egg", 90), prediction("egg", 200)])]);
    expect(score.correct).toBe(1);
    expect(score.extra).toBe(1);
    expect(score.quantityN).toBe(0);
    expect(score.gramMae).toBeNull();
    expect(score.quantityAmbiguous).toBe(1);
  });

  it("abstains from quantity when duplicate gold differ only by provenance", () => {
    const measured = gold("egg"); const guessed = { label: "egg", grams: 100 };
    const first = scoreCases("text", [capture([measured, guessed], [prediction("egg")])]);
    const reversed = scoreCases("text", [capture([guessed, measured], [prediction("egg")])]);
    expect(first).toEqual(reversed);
    expect(first.quantityN).toBe(0);
  });

  it("keeps quantity measurable when distinct canonical IDs disambiguate duplicate labels", () => {
    const score = scoreCases("text", [capture([gold("egg", 100, ["fdc:1"]), gold("egg", 200, ["fdc:2"])],
      [prediction("egg", 210, false, ["fdc:2"]), prediction("egg", 110, false, ["fdc:1"])])]);
    expect(score.quantityN).toBe(2);
    expect(score.gramMae).toBe(10);
  });

  it("does not treat a reference serving alone as consumed-mass truth", () => {
    const score = scoreCases("text", [capture([{ label: "egg", grams: 100, quantitySource: "reference_portion" }],
      [prediction("egg", 100)])]);
    expect(score.quantityN).toBe(0);
    expect(score.gramMae).toBeNull();
  });

  it.each([["chicken apple sausage", "apple"], ["butter", "peanut butter"],
    ["coconut", "coconut milk"], ["rice", "rice milk"], ["rice", "rice pudding"]])(
    "keeps distinct food labels %s and %s separate", (expected, actual) => {
      expect(identityTier(gold(expected), prediction(actual))).toBeNull();
    });

  it.each([["tomatoes", "tomato"], ["berries", "berry"], ["eggs", "egg"], ["potatoes", "potato"]])(
    "accepts the reviewed plural pair %s/%s", (expected, actual) => {
      expect(identityTier(gold(expected), prediction(actual))).toBe("label-only");
    });

  it('uses an explicitly adjudicated label alias without inventing substring equivalence', () => {
    expect(identityTier({ label: 'rice', grams: null, aliases: ['white rice, cooked'] },
      prediction('white rice cooked'))).toBe('label-only');
    expect(identityTier({ label: 'rice', grams: null }, prediction('white rice cooked'))).toBeNull();
  });
});
