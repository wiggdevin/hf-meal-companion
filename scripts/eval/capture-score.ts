/** Offline capture metrics. Parsed identity, catalog grounding and quantity have separate denominators. */
import type { CaptureMethod } from "@/lib/capture/flags";

export type QuantitySource = "stated_mass" | "weighed" | "printed_label" | "reference_portion" | "unknown";
export type GoldItem = { label: string; grams: number | null; ids?: string[]; aliases?: string[]; quantitySource?: QuantitySource };
export type PredictedItem = { label: string; grams: number | null; ids?: string[] };
export type CapturePrediction = PredictedItem & { autoResolved: boolean; alternatives: PredictedItem[] };
export type CaptureCase = {
  id?: string; method: CaptureMethod;
  status: "scored" | "provider_failure" | "service_unavailable" | "evaluation_failure" | "capture_failure" | "setup_failure" | "media_missing" | "not_run" | "unlabelled";
  expected: GoldItem[]; predictions: CapturePrediction[]; mediaPresent?: boolean;
  captureInvoked?: boolean; error?: string; errorCode?: string; cleanupError?: string;
};
export type CaseCounts = {
  total: number; labelled: number; unlabelled: number; mediaPresent: number; mediaMissing: number;
  notRun: number; providerFailure: number; serviceUnavailable: number; scored: number;
};
export type EvalResult = { expected: GoldItem; got: PredictedItem | null; autoResolved: boolean; inTop3: boolean };
export type MethodScore = {
  method: CaptureMethod; n: number; failed: number; itemAccuracy: number | null; gramMae: number | null;
  autoResolved: number; autoResolveMeasured: number; autoResolveGold: number;
  autoResolvePrecision: number | null; top3Containment: number | null; top3N: number;
};
export type CaptureMethodScore = MethodScore & {
  cases: CaseCounts; goldItems: number; correct: number; misidentified: number; missing: number;
  extra: number; extraPerCase: number | null; taskFailureCases: number;
  canonicalMatches: number; labelOnlyMatches: number; canonicalGroundingCases: number; canonicalIncomplete: number;
  errorCodes: Record<string, number>;
  quantityN: number; quantityUnscored: number; quantityAmbiguous: number;
  quantityMedianAbs: number | null; quantityP90Abs: number | null;
  quantityMedianPercent: number | null; quantityP90Percent: number | null;
  autoResolveCoverage: number | null;
};

/** Reviewed inflections only. Arbitrary suffix stripping changes food names. */
const PLURALS: Record<string, string> = {
  eggs: "egg", potatoes: "potato", tomatoes: "tomato", berries: "berry", olives: "olive",
  grapes: "grape", avocados: "avocado", bananas: "banana", cakes: "cake", squares: "square",
};
function normalized(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean).map((word) => PLURALS[word] ?? word).join(" ");
}
export function identityTier(gold: GoldItem, predicted: PredictedItem): "id" | "label-only" | null {
  if (gold.ids !== undefined) return gold.ids.some((id) => predicted.ids?.includes(id)) ? "id" : null;
  const actual = normalized(predicted.label);
  return actual.length > 0 && [gold.label, ...(gold.aliases ?? [])].some((label) => normalized(label) === actual)
    ? "label-only" : null;
}
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const idsKey = (item: PredictedItem) => [...(item.ids ?? [])].sort().join(",");
const identityKey = (item: PredictedItem) => `${idsKey(item)}|${normalized(item.label)}`;
const predictionKey = (item: CapturePrediction) => JSON.stringify([
  identityKey(item), item.autoResolved, item.alternatives.map(identityKey),
]);

/** An augmenting path may move a canonical owner only onto another valid canonical edge.
 * No amount enters identity ordering or matching; ambiguous quantities abstain below. */
function assignment(expected: GoldItem[], predictions: CapturePrediction[], top3 = false): Map<number, number> {
  const owners = new Map<number, number>();
  const orderedGold = expected.map((_, i) => i).sort((a, b) =>
    Number(expected[b].ids !== undefined) - Number(expected[a].ids !== undefined)
    || compare(identityKey(expected[a]), identityKey(expected[b]))
    || compare(expected[a].quantitySource ?? "", expected[b].quantitySource ?? ""));
  const orderedPredictions = predictions.map((_, i) => i).sort((a, b) =>
    compare(predictionKey(predictions[a]), predictionKey(predictions[b])));
  const matches = (gold: GoldItem, predicted: CapturePrediction) => top3
    ? (predicted.autoResolved ? [predicted] : predicted.alternatives.slice(0, 3))
      .some((candidate) => identityTier(gold, candidate) !== null)
    : identityTier(gold, predicted) !== null;
  const visit = (goldIndex: number, seen: Set<number>): boolean => {
    for (const index of orderedPredictions) {
      if (seen.has(index) || !matches(expected[goldIndex], predictions[index])) continue;
      seen.add(index);
      const owner = owners.get(index);
      if (owner === undefined || visit(owner, seen)) { owners.set(index, goldIndex); return true; }
    }
    return false;
  };
  for (const index of orderedGold) visit(index, new Set());
  return new Map([...owners].map(([predictionIndex, goldIndex]) => [goldIndex, predictionIndex]));
}
function quantityGold(gold: GoldItem): boolean {
  return ["stated_mass", "weighed", "printed_label"].includes(gold.quantitySource ?? "")
    && gold.grams !== null && Number.isFinite(gold.grams) && gold.grams > 0;
}
function quantityScorable(gold: GoldItem, predicted: PredictedItem): boolean {
  return quantityGold(gold) && predicted.grams !== null && Number.isFinite(predicted.grams) && predicted.grams >= 0;
}
function canonicalCase(expected: GoldItem[], predictions: CapturePrediction[]): boolean {
  return expected.length > 0 && expected.every((item) => (item.ids?.length ?? 0) > 0)
    && predictions.filter((item) => item.autoResolved).every((item) => (item.ids?.length ?? 0) > 0);
}
function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b); const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

/** Compatibility for explicitly prepaired results. It retains the same gold-basis checks and
 * cannot certify automatic catalog choices from an extraction label or a caller's boolean. */
export function scoreMethod(method: CaptureMethod, results: EvalResult[]): MethodScore {
  const correct = results.filter((r) => r.got !== null && identityTier(r.expected, r.got) !== null);
  const errors = correct.filter((r) => quantityScorable(r.expected, r.got!))
    .map((r) => Math.abs(r.got!.grams! - r.expected.grams!));
  const automatic = results.filter((r) => r.autoResolved && r.got !== null)
    .map((r) => ({ ...r.got!, autoResolved: true, alternatives: [] }));
  const canonical = canonicalCase(results.map((r) => r.expected), automatic);
  const top3Results = canonical ? results : [];
  return {
    method, n: results.length, failed: results.length - correct.length,
    itemAccuracy: results.length === 0 ? null : correct.length / results.length,
    gramMae: errors.length === 0 ? null : errors.reduce((sum, value) => sum + value, 0) / errors.length,
    autoResolved: automatic.length, autoResolveMeasured: canonical ? automatic.length : 0,
    autoResolveGold: canonical ? results.length : 0,
    // The legacy helper carries prepaired caller judgements, not a complete case-level catalog evaluation.
    autoResolvePrecision: null,
    top3N: top3Results.length,
    top3Containment: top3Results.length === 0 ? null : top3Results.filter((r) => r.inTop3
      && (!r.autoResolved || correct.includes(r))).length / top3Results.length,
  };
}

export function scoreCases(method: CaptureMethod, allCases: CaptureCase[]): CaptureMethodScore {
  const cases = allCases.filter((item) => item.method === method);
  const statuses = ["scored", "provider_failure", "service_unavailable", "evaluation_failure", "capture_failure", "setup_failure"];
  const scored = cases.filter((item) => item.expected.length > 0 && statuses.includes(item.status));
  const counts: CaseCounts = {
    total: cases.length, labelled: cases.filter((item) => item.expected.length > 0).length,
    unlabelled: cases.filter((item) => item.expected.length === 0).length,
    mediaPresent: cases.filter((item) => item.mediaPresent === true).length,
    mediaMissing: cases.filter((item) => item.mediaPresent === false).length,
    notRun: cases.filter((item) => item.status === "not_run").length,
    providerFailure: cases.filter((item) => item.status === "provider_failure").length,
    serviceUnavailable: cases.filter((item) => item.status === "service_unavailable").length, scored: scored.length,
  };
  let n = 0; let correct = 0; let missing = 0; let misidentified = 0; let extra = 0;
  let autoResolved = 0; let autoCorrect = 0; let autoResolveMeasured = 0; let autoResolveGold = 0;
  let top3 = 0; let top3N = 0; let canonicalGroundingCases = 0; let quantityAmbiguous = 0;
  let canonicalIncomplete = 0;
  let taskFailureCases = cases.filter((item) => item.expected.length === 0
    && statuses.includes(item.status) && item.status !== "scored").length;
  let canonicalMatches = 0; let labelOnlyMatches = 0;
  const absolute: number[] = []; const percent: number[] = [];
  for (const item of scored) {
    const predictions = item.status === "scored" ? item.predictions : [];
    const pairs = assignment(item.expected, predictions);
    const wrong = Math.min(item.expected.length - pairs.size, predictions.length - pairs.size);
    const absent = item.expected.length - pairs.size - wrong;
    const extras = predictions.length - pairs.size - wrong;
    n += item.expected.length; correct += pairs.size; misidentified += wrong; missing += absent; extra += extras;
    const automatic = predictions.filter((prediction) => prediction.autoResolved);
    autoResolved += automatic.length;
    const canonical = canonicalCase(item.expected, predictions);
    if (!canonical) canonicalIncomplete++;
    if (canonical && item.status === "scored") {
      canonicalGroundingCases++; autoResolveMeasured += automatic.length; autoResolveGold += item.expected.length;
      autoCorrect += assignment(item.expected, automatic).size;
    }
    if (canonical) {
      top3N += item.expected.length; top3 += assignment(item.expected, predictions, true).size;
    }
    if (wrong + absent + extras > 0 || item.status !== "scored") taskFailureCases++;
    const edges = item.expected.map((gold) => predictions.map((prediction, i) =>
      identityTier(gold, prediction) !== null ? i : -1).filter((i) => i >= 0));
    const predictionDegrees = predictions.map((_, index) => edges.filter((edge) => edge.includes(index)).length);
    const ambiguous = edges.map((edge) => edge.length > 1 || edge.some((i) => predictionDegrees[i] > 1));
    quantityAmbiguous += ambiguous.filter(Boolean).length;
    for (const [goldIndex, predictionIndex] of pairs) {
      const gold = item.expected[goldIndex]; const predicted = predictions[predictionIndex];
      if (identityTier(gold, predicted) === "id") canonicalMatches++; else labelOnlyMatches++;
      if (ambiguous[goldIndex] || !quantityScorable(gold, predicted)) continue;
      const error = Math.abs(predicted.grams! - gold.grams!);
      absolute.push(error); percent.push(error / gold.grams! * 100);
    }
  }
  return {
    method, cases: counts, goldItems: cases.reduce((sum, item) => sum + item.expected.length, 0),
    n, correct, missing, misidentified, extra, extraPerCase: scored.length === 0 ? null : extra / scored.length,
    failed: n - correct, itemAccuracy: n === 0 ? null : correct / n, taskFailureCases,
    canonicalMatches, labelOnlyMatches, canonicalGroundingCases, canonicalIncomplete,
    errorCodes: Object.fromEntries([...new Set(cases.flatMap((item) => item.errorCode ? [item.errorCode] : []))]
      .sort().map((code) => [code, cases.filter((item) => item.errorCode === code).length])),
    quantityN: absolute.length, quantityUnscored: n - absolute.length, quantityAmbiguous,
    gramMae: absolute.length === 0 ? null : absolute.reduce((sum, value) => sum + value, 0) / absolute.length,
    quantityMedianAbs: percentile(absolute, 0.5), quantityP90Abs: percentile(absolute, 0.9),
    quantityMedianPercent: percentile(percent, 0.5), quantityP90Percent: percentile(percent, 0.9),
    autoResolved, autoResolveMeasured, autoResolveGold,
    autoResolvePrecision: autoResolveMeasured === 0 ? null : autoCorrect / autoResolveMeasured,
    autoResolveCoverage: autoResolveGold === 0 ? null : autoResolveMeasured / autoResolveGold,
    top3N, top3Containment: top3N === 0 ? null : top3 / top3N,
  };
}
