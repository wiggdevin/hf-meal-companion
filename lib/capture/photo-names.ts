/**
 * Weak-spot audit 2026-11-17 item 7: the photo model appends cut and shape words to a food's name
 * ("pineapple chunks", "broccoli florets") although the prompt sends them to notes
 * (lib/ai/prompts.ts), and the longer name matches the catalog worse. This moves a CLOSED list of
 * cut and shape words from each label to the draft's notes. Cooking method, variety and colour stay
 * in the name: they change nutrition or identity, and the prompt requires a visible preparation.
 * No food-specific rule. Pure.
 */
import type { CaptureItems } from "@/lib/ai/schemas";

const CUT_WORDS = new Set([
  "sliced", "slice", "slices", "chunk", "chunks", "piece", "pieces", "floret", "florets",
  "wedge", "wedges", "cube", "cubes", "cubed", "diced", "halves", "halved", "chopped", "whole",
]);
/** "Whole" names a different food before these words ("whole milk", "whole wheat bread"). */
const WHOLE_KEEPS = new Set(["milk", "wheat", "grain", "grains", "yogurt", "yoghurt", "fat"]);

function stripCut(label: string): { label: string; cut: string[] } {
  const tokens = label.trim().split(/\s+/);
  const cut: string[] = [];
  const kept = tokens.filter((token, i) => {
    const word = token.toLowerCase();
    if (!CUT_WORDS.has(word)) return true;
    if (word === "whole" && WHOLE_KEEPS.has((tokens[i + 1] ?? "").toLowerCase().replace(/-.*/, ""))) return true;
    cut.push(word);
    return false;
  });
  // "chunks of pineapple": the "of" that joined the cut word goes with it.
  if (cut.length > 0 && kept[0]?.toLowerCase() === "of") kept.shift();
  return kept.length === 0 ? { label, cut: [] } : { label: kept.join(" "), cut };
}

export function withoutCutWords(parsed: CaptureItems): CaptureItems {
  const moved: string[] = [];
  const items = parsed.items.map((item) => {
    const { label, cut } = stripCut(item.label);
    if (cut.length === 0) return item;
    moved.push(`${item.label}: ${cut.join(", ")}`);
    return { ...item, label };
  });
  return moved.length === 0 ? parsed : { items, notes: [...parsed.notes, ...moved] };
}
