/** Offline capture metrics. Identity and amount are independent measurements. */
import type { CaptureMethod } from "@/lib/capture/flags";

export type QuantitySource = "stated_mass" | "weighed" | "printed_label" | "reference_portion" | "unknown";
export type GoldItem = {
  label: string; grams: number | null; ids?: string[]; quantitySource?: QuantitySource;
};
export type PredictedItem = { label: string; grams: number | null; ids?: string[] };
export type CapturePrediction = PredictedItem & { autoResolved: boolean; alternatives: PredictedItem[] };
export type CaptureCase = {
  id?: string; method: CaptureMethod;
  status: "scored" | "provider_failure" | "capture_failure" | "setup_failure" | "media_missing" | "not_run" | "unlabelled";
  expected: GoldItem[]; predictions: CapturePrediction[]; mediaPresent?: boolean;
  captureInvoked?: boolean; error?: string; errorCode?: string; cleanupError?: string;
};
export type CaseCounts = {
  total: number; labelled: number; unlabelled: number; mediaPresent: number; mediaMissing: number;
  notRun: number; providerFailure: number; scored: number;
};
export type CaptureMethodScore = MethodScore & {
  cases: CaseCounts; goldItems: number; correct: number; misidentified: number; missing: number;
  extra: number; extraPerCase: number | null; taskFailureCases: number;
  canonicalMatches: number; labelOnlyMatches: number; quantityN: number; quantityUnscored: number;
  quantityMedianAbs: number | null; quantityP90Abs: number | null;
  quantityMedianPercent: number | null; quantityP90Percent: number | null;
  autoResolveCoverage: number | null;
};
export type EvalResult = {
  expected: GoldItem; got: PredictedItem | null; autoResolved: boolean; inTop3: boolean;
};
export type MethodScore = {
  method: CaptureMethod; n: number; failed: number; itemAccuracy: number | null; gramMae: number | null;
  autoResolved: number; autoResolvePrecision: number | null; top3Containment: number | null;
};

function words(label: string): string[] {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter(Boolean).map((word) => word === "potatoes" ? "potato"
      : word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
}

/** Deliberately small collision guard, not an identity ontology. IDs supersede this fallback. */
export function identityTier(gold: GoldItem, predicted: PredictedItem): "id" | "label-only" | null {
  if (gold.ids !== undefined) return gold.ids.some((id) => predicted.ids?.includes(id)) ? "id" : null;
  const left = words(gold.label); const right = words(predicted.label);
  if (left.length === 0 || right.length === 0) return null;
  for (const [base, modifiers] of [["milk", ["coconut", "almond", "oat"]],
    ["potato", ["sweet"]], ["rice", ["cake"]]] as const) {
    if (left.includes(base) && right.includes(base)
      && modifiers.some((modifier) => left.includes(modifier) !== right.includes(modifier))) return null;
  }
  const phrase = (long: string[], short: string[]) => ` ${long.join(" ")} `.includes(` ${short.join(" ")} `);
  return phrase(left, right) || phrase(right, left) ? "label-only" : null;
}

export function scoreMethod(method: CaptureMethod, results: EvalResult[]): MethodScore {
  const n = results.length;
  const correct = results.filter((result) => result.got !== null
    && identityTier(result.expected, result.got) !== null);
  const gramErrors = correct.filter((result) => result.expected.grams !== null
    && result.got?.grams !== null && Number.isFinite(result.got?.grams))
    .map((result) => Math.abs(result.got!.grams! - result.expected.grams!));
  const auto = results.filter((result) => result.autoResolved);
  return {
    method, n, failed: n - correct.length, itemAccuracy: n === 0 ? null : correct.length / n,
    gramMae: gramErrors.length === 0 ? null : gramErrors.reduce((sum, value) => sum + value, 0) / gramErrors.length,
    autoResolved: auto.length,
    autoResolvePrecision: auto.length === 0 ? null : correct.filter((result) => result.autoResolved).length / auto.length,
    top3Containment: n === 0 ? null : results.filter((result) => result.inTop3
      && (!result.autoResolved || correct.includes(result))).length / n,
  };
}

/** Maximum one-to-one matching within the canonical tier first, then the label-only tier.
 * Canonical gold cannot be displaced by a weaker label-only claim. Sorting makes ambiguous
 * duplicate identities deterministic under input reorder; grams never establish identity. */
function assignment(
  expected: GoldItem[], predictions: CapturePrediction[], top3 = false,
): Map<number, number> {
  const owners = new Map<number, number>();
  const key = (item: PredictedItem) => `${[...(item.ids ?? [])].sort().join(",")}|${item.label}|${item.grams}`;
  const orderedGold = expected.map((_, index) => index).sort((a, b) =>
    Number(expected[b].ids !== undefined) - Number(expected[a].ids !== undefined)
    || key(expected[a]).localeCompare(key(expected[b])));
  const orderedPredictions = predictions.map((_, index) => index).sort((a, b) =>
    key(predictions[a]).localeCompare(key(predictions[b])));
  const matches = (gold: GoldItem, predicted: CapturePrediction) => top3
    ? (predicted.autoResolved ? [predicted] : predicted.alternatives.slice(0, 3))
      .some((candidate) => identityTier(gold, candidate) !== null)
    : identityTier(gold, predicted) !== null;
  const visit = (goldIndex: number, seen: Set<number>): boolean => {
    for (const index of orderedPredictions) {
      if (seen.has(index) || !matches(expected[goldIndex], predictions[index])) continue;
      seen.add(index);
      const owner = owners.get(index);
      if (owner === undefined || (expected[owner].ids === undefined || expected[goldIndex].ids !== undefined)
        && visit(owner, seen)) {
        owners.set(index, goldIndex);
        return true;
      }
    }
    return false;
  };
  for (const index of orderedGold) visit(index, new Set());
  return new Map([...owners].map(([predictionIndex, goldIndex]) => [goldIndex, predictionIndex]));
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function scoreCases(method: CaptureMethod, allCases: CaptureCase[]): CaptureMethodScore {
  const cases = allCases.filter((item) => item.method === method);
  const scored = cases.filter((item) => item.expected.length > 0
    && ["scored", "provider_failure", "capture_failure", "setup_failure"].includes(item.status));
  const counts: CaseCounts = {
    total: cases.length, labelled: cases.filter((item) => item.expected.length > 0).length,
    unlabelled: cases.filter((item) => item.expected.length === 0).length,
    mediaPresent: cases.filter((item) => item.mediaPresent === true).length,
    mediaMissing: cases.filter((item) => item.mediaPresent === false).length,
    notRun: cases.filter((item) => item.status === "not_run").length,
    providerFailure: cases.filter((item) => item.status === "provider_failure").length,
    scored: scored.length,
  };
  let n = 0; let correct = 0; let missing = 0; let misidentified = 0; let extra = 0;
  let autoResolved = 0; let autoCorrect = 0; let top3 = 0;
  let taskFailureCases = cases.filter((item) => item.expected.length === 0
    && ["provider_failure", "capture_failure", "setup_failure"].includes(item.status)).length;
  let canonicalMatches = 0; let labelOnlyMatches = 0;
  const absolute: number[] = []; const percent: number[] = [];
  for (const item of scored) {
    const predictions = item.status === "scored" ? item.predictions : [];
    const pairs = assignment(item.expected, predictions);
    const wrong = Math.min(item.expected.length - pairs.size, predictions.length - pairs.size);
    const absent = item.expected.length - pairs.size - wrong;
    const extras = predictions.length - pairs.size - wrong;
    n += item.expected.length; correct += pairs.size; misidentified += wrong; missing += absent; extra += extras;
    autoResolved += predictions.filter((prediction) => prediction.autoResolved).length;
    top3 += assignment(item.expected, predictions, true).size;
    if (wrong + absent + extras > 0 || item.status === "provider_failure" || item.status === "setup_failure") taskFailureCases++;
    for (const [goldIndex, predictionIndex] of pairs) {
      const gold = item.expected[goldIndex]; const predicted = predictions[predictionIndex];
      if (identityTier(gold, predicted) === "id") canonicalMatches++; else labelOnlyMatches++;
      if (predicted.autoResolved) autoCorrect++;
      if (gold.quantitySource === undefined || gold.quantitySource === "unknown" || gold.grams === null
        || gold.grams <= 0 || !Number.isFinite(gold.grams) || predicted.grams === null
        || !Number.isFinite(predicted.grams)) continue;
      const error = Math.abs(predicted.grams - gold.grams);
      absolute.push(error); percent.push(error / gold.grams * 100);
    }
  }
  return {
    method, cases: counts, goldItems: cases.reduce((sum, item) => sum + item.expected.length, 0),
    n, correct, missing, misidentified, extra, extraPerCase: scored.length === 0 ? null : extra / scored.length,
    failed: n - correct, itemAccuracy: n === 0 ? null : correct / n, taskFailureCases,
    canonicalMatches, labelOnlyMatches, quantityN: absolute.length, quantityUnscored: n - absolute.length,
    gramMae: absolute.length === 0 ? null : absolute.reduce((sum, value) => sum + value, 0) / absolute.length,
    quantityMedianAbs: percentile(absolute, 0.5), quantityP90Abs: percentile(absolute, 0.9),
    quantityMedianPercent: percentile(percent, 0.5), quantityP90Percent: percentile(percent, 0.9),
    autoResolved, autoResolvePrecision: autoResolved === 0 ? null : autoCorrect / autoResolved,
    autoResolveCoverage: n === 0 ? null : autoResolved / n,
    top3Containment: n === 0 ? null : top3 / n,
  };
}
