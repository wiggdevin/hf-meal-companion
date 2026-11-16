import type { EvidenceByName } from "@/lib/coach/policy";

export type LoggedConfirmationItem = { name: string; grams: number; foodRefId: string;
  slot?: string; at?: string; occasion?: string };

// Catalog labels can be long or contain percentages, but never clear an instruction clause.
const CLAUSE_WORD = /\b(?:then|try|have|eat|should|could|would|because|but|also|next|later)\b/i;
function plainName(name: string): boolean {
  return name.trim().length > 0 && !/[!?;:]/.test(name) && !CLAUSE_WORD.test(name);
}

const nameKey = (name: string) => name.normalize("NFKD").toLowerCase()
  .replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}%' -]/gu, " ").replace(/\s+/g, " ").trim();

function aliases(name: string): string[] {
  if (!plainName(name)) return [];
  const [head, qualifier] = name.split(",").map((part) => part.trim());
  return [name, head, ...(qualifier ? [`${qualifier} ${head}`] : [])].map(nameKey);
}

function sameDestination(named: string | undefined, item: LoggedConfirmationItem): boolean {
  if (!named) return true;
  if (/^\d/.test(named)) return named === item.at;
  const key = named.toLowerCase().replace(/^a /, "").replace(/\s+/g, "");
  return key.startsWith("meal") ? key.replace(/^meal-?/, "meal-") === item.slot
    : (key === "snack" && item.slot === "snack") || key === item.occasion;
}

/** Only a complete, quantified confirmation of a successfully grounded log leaves the advice scan. */
export function withoutLogConfirmations(
  text: string, items: readonly LoggedConfirmationItem[], evidence: EvidenceByName,
): string {
  return text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const match = /^\s*(?:i(?:['’]ve| have)?\s+)?logged\s+(.+?)(?:\s+(?:for|as|at)\s+(breakfast|lunch|dinner|a snack|snack|meal[-\s]*[1-6]|[0-2]\d:[0-5]\d))?[.!]?\s*$/i.exec(sentence);
    if (!match) return true;
    const used = new Set<number>();
    return !match[1].split(/\s+and\s+(?=\d+(?:\.\d+)?\s*(?:g|grams?)\b)/i).every((part) => {
      const portion = /^(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?(.+)$/i.exec(part);
      if (!portion) return false;
      const index = items.findIndex((item, index) => {
        if (used.has(index) || item.grams !== Number(portion[1]) || !item.foodRefId
            || !sameDestination(match[2], item)) return false;
        // Only actual completed catalog names with this exact ref may name the confirmation.
        return Object.entries(evidence).filter(([, entry]) => entry.foodRefId === item.foodRefId)
          .flatMap(([name]) => aliases(name)).includes(nameKey(portion[2]));
      });
      if (index < 0) return false;
      used.add(index);
      return true;
    });
  }).join(" ");
}
