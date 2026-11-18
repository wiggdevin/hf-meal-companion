import type { EvidenceByName } from "@/lib/coach/policy";
import { catalogFoodNames, foodNameKey } from "@/lib/coach/food-names";

export type LoggedConfirmationItem = { name: string; grams: number; foodRefId: string;
  slot?: string; at?: string; occasion?: string; verdict?: string };

// Catalog labels can be long or contain percentages, but never clear an instruction clause.
const CLAUSE_WORD = /\b(?:then|try|have|eat|should|could|would|because|but|also|next|later)\b/i;
function plainName(name: string): boolean {
  return name.trim().length > 0 && !/[!?;:]/.test(name) && !CLAUSE_WORD.test(name);
}

function aliases(name: string): string[] {
  if (!plainName(name)) return [];
  return catalogFoodNames(name).map(foodNameKey);
}

function sameDestination(named: string | undefined, item: LoggedConfirmationItem): boolean {
  if (!named) return true;
  if (/^\d/.test(named)) return named === item.at;
  const key = named.toLowerCase().replace(/^a /, "").replace(/\s+/g, "");
  return key.startsWith("meal") ? key.replace(/^meal-?/, "meal-") === item.slot
    : item.slot === "snack" ? key === "snack" : key === item.occasion;
}

/** Only a complete, quantified confirmation of a successfully grounded log leaves the advice scan. */
export function withoutLogConfirmations(
  text: string, items: readonly LoggedConfirmationItem[], evidence: EvidenceByName, notices: readonly string[] = [],
): string {
  return projectLogText(text, items, evidence, notices).advice;
}

/** Replace model ingredient warnings with the actual server notice, keeping the bound record. */
export function withoutLogPolicyWarnings(
  text: string, items: readonly LoggedConfirmationItem[], evidence: EvidenceByName, notices: readonly string[] = [],
): string {
  return projectLogText(text, items, evidence, notices).display;
}

function confirmation(sentence: string, items: readonly LoggedConfirmationItem[], evidence: EvidenceByName): number[] {
    const match = /^\s*(?:i(?:['’]ve| have)?\s+)?logged\s+(.+?)(?:\s+(?:for|as|at)\s+(breakfast|lunch|dinner|a snack|snack|meal[-\s]*[1-6]|[0-2]\d:[0-5]\d))?(?:\s+at\s+([0-2]\d:[0-5]\d))?[.!]?\s*$/i.exec(sentence);
    if (!match) return [];
    const used = new Set<number>();
    const confirmed = match[1].split(/\s+and\s+(?=\d+(?:\.\d+)?\s*(?:g|grams?)\b)/i).every((part) => {
      const portion = /^(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?(.+)$/i.exec(part);
      if (!portion) return false;
      const index = items.findIndex((item, index) => {
        if (used.has(index) || item.grams !== Number(portion[1]) || !item.foodRefId
            || !sameDestination(match[2], item) || !sameDestination(match[3], item)) return false;
        // Only actual completed catalog names with this exact ref may name the confirmation.
        return Object.entries(evidence).filter(([, entry]) => entry.foodRefId === item.foodRefId)
          .flatMap(([name]) => aliases(name)).includes(foodNameKey(portion[2]));
      });
      if (index < 0) return false;
      used.add(index);
      return true;
    });
    return confirmed ? [...used] : [];
}

function warning(sentence: string, item: LoggedConfirmationItem, evidence: EvidenceByName,
  notices: readonly string[]): boolean {
  if (item.verdict !== "blocked" || !notices.includes(`Off-plan: ${item.name}.`)) return false;
  const match = /^This (?:food )?is off-plan (?:as|because) it contains (.+?)[.!]?$/i.exec(sentence);
  if (!match || CLAUSE_WORD.test(match[1])
      || /\b(?:recommend\w*|safe|allowed|healthy|compliant|for|breakfast|lunch|dinner|snack|meal)\b/i.test(match[1])) return false;
  const words = Object.entries(evidence).filter(([, e]) => e.foodRefId === item.foodRefId && !e.ambiguous)
    .flatMap(([name, e]) => [name, ...(e.allergenTags ?? [])]).flatMap((value) => foodNameKey(value).split(" "));
  const allowed = new Set([...words, "and", "or"]);
  const tokens = foodNameKey(match[1]).split(" ");
  return tokens.length > 0 && tokens.every((token) => allowed.has(token));
}

/** The same projection governs delivered model sentences and the advice scan. */
export function projectLogText(text: string, items: readonly LoggedConfirmationItem[],
  evidence: EvidenceByName, notices: readonly string[] = []) {
  const display: string[] = [], advice: string[] = [], confirmed: LoggedConfirmationItem[] = [];
  let previous: number[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (previous.length === 1 && warning(sentence, items[previous[0]], evidence, notices)) {
      previous = [];
      continue;
    }
    previous = confirmation(sentence, items, evidence);
    display.push(sentence);
    if (previous.length) confirmed.push(...previous.map((index) => items[index]));
    else advice.push(sentence);
  }
  return { display: display.join(" "), advice: advice.join(" "), confirmed };
}
