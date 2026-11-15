/**
 * Amounts, in the one direction that matters: their words (or the model's) to grams (spec §7).
 *
 * A vague measure returns null on purpose. "A handful" has no gram weight, and inventing one would
 * put a number in their day that nothing stands behind; null sends the item to the stepper instead.
 * A volume unit with no portion row is the same case: grams per cup is a density, and we have none.
 * So is a count with no portion row (audit 2026-10-10 A007, A044): "two bananas" or "8 shrimp" has
 * no weight here, and the caller keeps the model's own grams rather than a flat 100 g a piece.
 *
 * A portion row's gram weight is the weight of the amount its label names: `import-fdc.py`
 * `portion_label` writes "<amount> <unit> …", so "0.5 cup" weighs half a cup (A006).
 *
 * Pure. No I/O.
 */

const GRAMS_PER_POUND = 453.59237;
const GRAMS_PER_OZ = GRAMS_PER_POUND / 16;
export const MAX_CAPTURE_GRAMS = 5000;
const MASS_GRAMS: Record<string, number> = { g: 1, kg: 1000, mg: 0.001,
  oz: GRAMS_PER_OZ, lb: GRAMS_PER_POUND };
const VULGAR_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  "⅐": "1/7", "⅑": "1/9", "⅒": "1/10", "⅕": "1/5", "⅖": "2/5",
  "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6",
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25,
};

/** The units the prompts allow (lib/ai/prompts.ts UNITS) plus the spellings people use. */
const UNIT_WORDS: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gs: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  mg: "mg", milligram: "mg", milligrams: "mg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  fl: "fl oz", floz: "fl oz", // volume, never the avoirdupois ounce mass factor
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  whole: "whole",
};

/** Measures with no gram weight. Refused, never rounded into a number. */
const VAGUE = new Set(["handful", "handfuls", "bunch", "some", "few", "bit", "scoop", "scoops",
  "serving", "servings", "portion", "portions", "plate", "bowl"]);

function normalizedUnit(unit: string): string {
  const raw = unit.trim().toLowerCase();
  return Object.hasOwn(UNIT_WORDS, raw) ? UNIT_WORDS[raw] : raw;
}

function normalizedNotation(text: string): string {
  return (text ?? "").replace(/⁄/g, "/")
    .replace(/([¼½¾⅐-⅞])/g, (fraction) => ` ${VULGAR_FRACTIONS[fraction]} `)
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (number) => number.replaceAll(",", ""));
}

const QTY_TOKEN = `(?:\\d+(?:[./]\\d+)?|\\.\\d+|${Object.keys(WORD_NUMBERS).join("|")})`;
const RANGE = new RegExp(`${QTY_TOKEN}(?:\\s+(?:${Object.keys(UNIT_WORDS).join("|")}))?`
  + `\\s*(?:[-–—]|\\bto\\b|\\bor\\b|\\band\\b)\\s*${QTY_TOKEN}(?![\\p{L}\\p{N}])`, "iu");
const NEGATIVE = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:[-−–—]\\s*|(?:negative|minus)\\s+)`
  + `${QTY_TOKEN}(?![\\p{L}\\p{N}])`, "iu");

function readQty(token: string): number | null {
  const word = Object.hasOwn(WORD_NUMBERS, token) ? WORD_NUMBERS[token] : undefined;
  if (word !== undefined) return word;
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const bottom = Number(fraction[2]);
    const value = Number(fraction[1]) / bottom;
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const n = Number(token);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseAmount(text: string): { qty: number; unit: string } | null {
  const expanded = normalizedNotation(text);
  // Do not erase a minus sign or choose one end of a range while normalizing punctuation.
  // Unhandled Unicode numbers and ambiguous decimal commas must not lose characters either.
  if (NEGATIVE.test(expanded) || RANGE.test(expanded)
    || /[\p{No}\p{Nl}]|\d,\d/u.test(expanded)) return null;
  const tokens = expanded.toLowerCase().replace(/[^a-z0-9/.\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    let qty = readQty(tokens[i]);
    if (qty === null) {
      if (/^(?:\d|\.\d)/.test(tokens[i])) return null;
      continue;
    }
    // "a half cup" names half a cup, not one cup.
    if ((tokens[i] === "a" || tokens[i] === "an")
      && (tokens[i + 1] === "half" || tokens[i + 1] === "quarter")) continue;
    let unitStart = i + 1;
    if (/^\d+$/.test(tokens[i]) && /^\d+\/\d+$/.test(tokens[i + 1] ?? "")) {
      const fraction = readQty(tokens[i + 1]);
      if (fraction === null) return null;
      qty += fraction;
      unitStart += 1;
    }
    while (["of", "a", "an"].includes(tokens[unitStart])) unitStart += 1;
    const next = tokens[unitStart];
    if (VAGUE.has(next)) return null;
    const unit = Object.hasOwn(UNIT_WORDS, next) ? UNIT_WORDS[next] : undefined;
    if (unit) return { qty, unit };
    // A bare count with no unit word is a count of the food itself: "two eggs".
    return { qty, unit: "whole" };
  }
  return null;
}

export type CapturePortion = { id: number | null; description: string; gramWeight: number };

/**
 * The amount a portion label starts with: "0.5 cup" → 0.5, "1/2 cup" → 0.5, "1 1/2 cups" → 1.5,
 * "2 tbsp" → 2. A label with no leading amount ("NLEA serving", "slice") is one of itself.
 */
export function portionAmount(description: string): number {
  const text = normalizedNotation(description).trim();
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)(?![\d.\/])/);
  if (mixed) return positiveOr1(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]));
  const fraction = text.match(/^(\d+)\/(\d+)(?![\d.\/])/);
  if (fraction) return positiveOr1(Number(fraction[1]) / Number(fraction[2]));
  const decimal = text.match(/^(\d+(?:\.\d+)?|\.\d+)(?![\d\/])/);
  return decimal ? positiveOr1(Number(decimal[1])) : 1;
}

function positiveOr1(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function usable(p: CapturePortion): boolean {
  return Number.isFinite(p.gramWeight) && p.gramWeight > 0
    && !/[\p{No}\p{Nl}]|\d,\d/u.test(normalizedNotation(p.description));
}

/**
 * The portion row whose label names the unit, preferring one of exactly one unit ("1 cup" over
 * "0.5 cup") so the matched row reads the way the user said it.
 */
export function matchPortion(unit: string, portions: CapturePortion[]): CapturePortion | null {
  const want = unit.toLowerCase();
  const words = (p: CapturePortion) => p.description.toLowerCase().split(/[^a-z]+/).filter(Boolean)
    .map(normalizedUnit);
  for (const word of [want, `${want}s`]) {
    const named = portions.filter((p) => usable(p) && words(p).includes(word));
    const one = named.find((p) => portionAmount(p.description) === 1);
    if (one ?? named[0]) return one ?? named[0];
  }
  return null;
}

/** Pure shared mass factor, including the spellings accepted by the parser. */
export function massGramsPerUnit(unit: string): number | null {
  const factor = MASS_GRAMS[normalizedUnit(unit)];
  return typeof factor === "number" ? factor : null;
}

function boundedGrams(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= MAX_CAPTURE_GRAMS ? value : null;
}

/** Grams within capture's bound, or null when the amount cannot be weighed here. */
export function gramsFor(qty: number, unit: string, portions: CapturePortion[]): number | null {
  if (!Number.isFinite(qty) || qty < 0) return null;
  const want = normalizedUnit(unit);
  const factor = massGramsPerUnit(want);
  if (factor !== null) return boundedGrams(qty * factor);
  const portion = matchPortion(want, portions);
  if (!portion) return null;
  return boundedGrams((qty * portion.gramWeight) / portionAmount(portion.description));
}
