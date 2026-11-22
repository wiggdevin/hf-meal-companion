/**
 * The one grammar for a nutrition chart request, shared by the coach-command admission gate
 * (lib/profile/coach-commands.ts: may the text reach Jev) and the chart args the intent pre-pass
 * builds (lib/coach/intent.ts `chartArgs`). One list of count words, subjects and windows, so a
 * phrasing the gate admits is one `chartArgs` can read, and the other way round.
 *
 * Pure. No I/O.
 */

export const TREND_MIN_DAYS = 7;
export const TREND_MAX_DAYS = 90;
/** The window an open-ended trend ask ("lately", "protein trend") reads: two weeks. */
export const OPEN_TREND_DAYS = 14;

export const COUNT_WORDS: Readonly<Record<string, number>> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
  sixty: 60, ninety: 90,
};
const SPAN_UNIT_DAYS: Readonly<Record<string, number>> = { day: 1, week: 7, fortnight: 14, month: 30 };

/** A count: digits (up to three) or one of COUNT_WORDS. Lower case, for normalized text. */
export const COUNT = `(?:\\d{1,3}|${Object.keys(COUNT_WORDS).join("|")})`;
const UNIT = "(?:days?|weeks?|fortnights?|months?)";

/** A trend window clamped to 7..90 whole days; `fallback` when absent or not a number. */
export function clampTrendDays(days: number | null | undefined, fallback: number): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return fallback;
  return Math.min(TREND_MAX_DAYS, Math.max(TREND_MIN_DAYS, Math.round(days)));
}

/**
 * The window a chart request names, in days (the widest one named), NOT clamped: "last 30 days",
 * "past 2 weeks", "a fortnight", "this month" (30), "one week". Null when it names none.
 */
export function chartSpanDays(message: string): number | null {
  const spans: number[] = [];
  const counted = new RegExp(`\\b(${COUNT})\\s+(day|week|fortnight|month)s?\\b`, "gi");
  for (const [, rawCount, rawUnit] of message.matchAll(counted)) {
    const raw = rawCount.toLowerCase();
    const unit = rawUnit.toLowerCase();
    // "protein a day" is a rate, not a window.
    if (unit === "day" && (raw === "a" || raw === "an")) continue;
    const count = /^\d+$/.test(raw) ? Number(raw) : COUNT_WORDS[raw];
    if (count > 0) spans.push(count * SPAN_UNIT_DAYS[unit]);
  }
  for (const [, unit] of message.matchAll(/\b(?:this|last|past|the)\s+(week|fortnight|month)\b/gi)) {
    spans.push(SPAN_UNIT_DAYS[unit.toLowerCase()]);
  }
  // "over the past day" is a window of one (clamped to 7); "for the day" stays today's chart.
  if (/\b(?:last|past)\s+day\b/i.test(message)) spans.push(1);
  return spans.length > 0 ? Math.max(...spans) : null;
}

/** "this week" with no other window: `kcal_week`'s original "last seven logged days". */
export function isThisWeekOnly(message: string): boolean {
  return /\bthis week\b/i.test(message) && chartSpanDays(message.replace(/\bthis week\b/gi, "")) === null;
}

/** Body composition and weight-loss talk, which names "fat" but is not the fat macro. */
const NOT_THE_MACRO = /\bbody[- ]?fat\b|\bfat[- ]?(?:loss|burn(?:ing)?|percent(?:age)?|mass)\b|\blos(?:e|ing) fat\b|\bburn(?:ing)? fat\b/gi;
const MACRO_WORD = /\b(?:macros?|protein|carbs?|carbohydrates?|fats?)\b/i;

/** The text with body-composition phrases removed, for the macro tests below. */
function macroText(message: string): string {
  return message.replace(NOT_THE_MACRO, " ");
}

/** Whether the message names a dietary macro ("body fat" and "fat loss" do not). */
export function mentionsMacro(message: string): boolean {
  return MACRO_WORD.test(macroText(message));
}

/** The one macro the message names, when it names exactly one. */
export function focusMacro(message: string): "protein" | "carbs" | "fat" | undefined {
  const text = macroText(message);
  const named = ([
    ["protein", /\bprotein\b/i], ["carbs", /\bcarbs?\b|\bcarbohydrates?\b/i], ["fat", /\bfats?\b/i],
  ] as const).filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
  return named.length === 1 ? named[0] : undefined;
}

/** Asked over time without a window: "how has my protein been", "my macros lately", "protein trend". */
export const OVER_TIME = /\b(?:trends?|over time|lately|recently|by day|each day|daily|per day)\b|\bhow (?:has|have|is|are)\b.*\bbeen\b/i;

const SPAN = `(?:(?:over|for|in|during|from) )?(?:the )?(?:(?:this|last|past) (?:${COUNT} )?|${COUNT} )${UNIT}`;
const TREND_WINDOW = `(?:${SPAN}|lately|recently|over time|by day|each day|daily|per day)`;
const SUBJECT = "(?:my )?(?:macros?|protein|carbs?|carbohydrates?|fats?|calories|calorie|kcal)(?: intake)?";
const NUTRITION_TREND: readonly RegExp[] = [
  new RegExp(`^(?:show|chart|graph) (?:me )?${SUBJECT}(?: trend| chart)? ${TREND_WINDOW}$`),
  new RegExp(`^(?:show|chart|graph) (?:me )?${SUBJECT} (?:trend|chart)$`),
  new RegExp(`^${SUBJECT}(?: trend| chart)? ${TREND_WINDOW}$`),
  new RegExp(`^${SUBJECT} (?:trend|chart)$`),
  new RegExp(`^how (?:has|have|is|are) ${SUBJECT} been(?: doing)?(?: ${TREND_WINDOW})?$`),
];

/** The whole normalized (lower-case) message is a nutrition chart request. */
export function isNutritionTrendCommand(message: string): boolean {
  return NUTRITION_TREND.some((form) => form.test(message));
}
