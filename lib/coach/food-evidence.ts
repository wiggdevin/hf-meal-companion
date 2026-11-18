import type { EvidenceByName } from "@/lib/coach/policy";
import { catalogNameMatches } from "@/lib/coach/food-names";

type Entry = EvidenceByName[string];
const key = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().trim().replace(/\s+/g, " ");

export function unknownFoodEvidence(onAvoidList = false): Entry {
  return { foodRefId: null, catalogFoodRevisionId: null, allergenTags: null, category: null,
    onEatsList: false, onAvoidList, ambiguous: true };
}

function combine(entries: Entry[]): Entry {
  const ids = new Set(entries.map((entry) => entry.foodRefId).filter(Boolean));
  const avoided = entries.some((entry) => entry.onAvoidList);
  const revisions = new Set(entries.map((entry) => entry.catalogFoodRevisionId).filter((id) => id != null));
  const tags = new Set(entries.filter((entry) => entry.allergenTags != null)
    .map((entry) => JSON.stringify([...entry.allergenTags!].sort())));
  if (ids.size > 1 || revisions.size > 1 || tags.size > 1 || entries.some((entry) => entry.ambiguous)) {
    return unknownFoodEvidence(avoided);
  }
  return { ...entries.at(-1)!, onAvoidList: avoided };
}

/** One normalized name can never borrow facts from a different resolved identity. */
export function foodEvidenceFor(evidence: EvidenceByName, name: string): Entry | undefined {
  const entries = Object.entries(evidence).filter(([held]) =>
    catalogNameMatches(held, name)).map(([, value]) => value);
  return entries.length ? combine(entries) : undefined;
}

export function recordFoodEvidence(evidence: EvidenceByName, name: string, entry: Entry): void {
  const matching = Object.keys(evidence).filter((held) => key(held) === key(name));
  const combined = combine([...matching.map((held) => evidence[held]), entry]);
  for (const held of matching) evidence[held] = combined;
  evidence[name] = combined;
}

export function mergeFoodEvidence(...sources: EvidenceByName[]): EvidenceByName {
  const merged: EvidenceByName = {};
  for (const source of sources) for (const [name, entry] of Object.entries(source)) {
    recordFoodEvidence(merged, name, entry);
  }
  return merged;
}
