import { hitNamesPhrase } from "@/lib/coach/reply-mentions";
import { occasionAt } from "@/lib/meals/occasion";

export type PlanRead = { date: string; slots: { slot: string; label: string; title: string;
  time: string; state: string; items: string[] }[] };
const key = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
const clean = (s: string) => !/[.!?;]/.test(s.replace(/(\d)\.(?=\d)/g, "$1"))
  && !/\b(?:try|should|eat|have|then|instead|safe|allowed|fine|ok|okay|compliant|recommend\w*|healthy)\b|-free\b/i.test(s);
const REQUEST = /^(?:what['’]s|what is|show me) my (breakfast|lunch|dinner|snack|plan|meal[- ]?[1-6])(?: (.*?))?[.!?]?$/i;

/** The read exception is available only for a whole-message request to report an existing plan. */
export function isPlanReadRequest(message: string): boolean {
  const match = REQUEST.exec(message.trim());
  if (!match) return false;
  const tail = (match[2] ?? "").toLowerCase().replace(/[.!?]$/, "");
  const calendar = new Set(("today tomorrow yesterday tonight on a an the in next this last week weeks "
    + "day days from now monday tuesday wednesday thursday friday saturday sunday january february "
    + "march april may june july august september october november december").split(" "));
  return tail === "" || tail.split(/\s+/).every((token) => calendar.has(token) || /^\d+(?:-\d+){0,2}$/.test(token));
}

/** A read exemption names the actual requested account slot and local date, never a fixed slot map. */
export function planReadsForRequest(reads: readonly PlanRead[], message: string, today: string): PlanRead[] {
  if (!isPlanReadRequest(message)) return [];
  const match = REQUEST.exec(message.trim())!;
  const meal = match[1].toLowerCase().replace(/meal[- ]?/, "meal-");
  const tail = (match[2] ?? "").toLowerCase().replace(/[.!?]$/, "");
  let date: string | undefined;
  const offsets: Record<string, number> = { "": 0, today: 0, tomorrow: 1, yesterday: -1,
    "a week from today": 7, "in a week": 7 };
  if (tail in offsets) date = new Date(Date.parse(`${today}T12:00:00Z`) + offsets[tail] * 86_400_000).toISOString().slice(0, 10);
  else if (/^(?:on )?\d{4}-\d{2}-\d{2}$/.test(tail)) date = tail.replace(/^on /, "");
  else {
    const months = "january february march april may june july august september october november december".split(" ");
    const dated = /^(?:on )?([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(tail);
    if (dated && months.includes(dated[1])) {
      const value = new Date(Date.UTC(Number(dated[3] ?? today.slice(0, 4)), months.indexOf(dated[1]), Number(dated[2]), 12));
      if (value.getUTCDate() === Number(dated[2])) date = value.toISOString().slice(0, 10);
    }
  }
  if (!date) return [];
  return reads.filter((read) => read.date === date).map((read) => ({ ...read, slots: read.slots.filter((slot) =>
    meal === "plan" || slot.slot === meal || (slot.slot === "snack" ? meal === "snack" : occasionAt(slot.time) === meal)) }));
}

/** A completed owner-scoped get_plan read; partial or malformed tool data proves nothing. */
export function planRead(value: unknown): PlanRead | null {
  if (!value || typeof value !== "object") return null;
  const v = value as PlanRead;
  if (typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.slots)) return null;
  const valid = v.slots.every((slot) => slot &&
    [slot.slot, slot.label, slot.title, slot.time, slot.state].every((s) => typeof s === "string")
    && Array.isArray(slot.items) && slot.items.every((s) => typeof s === "string"));
  return valid ? v : null;
}

/** Remove exact factual report sentences only. A later recommendation is still advice. */
export function withoutPlanReports(text: string, reads: readonly PlanRead[], onExempt?: () => void): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let reported: PlanRead["slots"][number] | undefined;
  return sentences.filter((sentence, index) => {
    const body = key(sentence.replace(/[.!]$/, ""));
    for (const read of reads) for (const slot of read.slots) {
      if (slot.state === "empty" || !clean(slot.title)) continue;
      const date = new Date(`${read.date}T12:00:00Z`).toLocaleDateString("en-US",
        { month: "long", day: "numeric", timeZone: "UTC" }).toLowerCase();
      const title = key(slot.title);
      const labels = [key(slot.label), key(slot.slot), occasionAt(slot.time)].filter(Boolean);
      const planned = `it is planned for ${slot.time} on ${date}`;
      const pairedTitle = body === title && key((sentences[index + 1] ?? "").replace(/[.!]$/, "")) === planned;
      const forms = [planned,
        ...labels.flatMap((label) => [`on ${date}, your ${label} is ${title}`,
          `on ${date}, your ${label} is ${title} at ${slot.time}`])];
      if ((pairedTitle || forms.includes(body)) && (!body.startsWith("it is planned") || reported === slot)) {
        reported = slot;
        onExempt?.();
        return false;
      }
    }
    if (reported && body.startsWith("it includes ")) {
      const portions = [...body.slice(12).matchAll(/(?:^|,\s*(?:and\s+)?|\s+and\s+)(\d+(?:\.\d+)?)\s*g\s+(?:of\s+)?(.+?)(?=,\s*(?:and\s+)?\d+(?:\.\d+)?\s*g\b|\s+and\s+\d+(?:\.\d+)?\s*g\b|$)/g)];
      const actual = reported.items.map((item) => /^(\d+(?:\.\d+)?)\s*g\s+(.+?)\s+-\s+/.exec(item));
      const used = new Set<number>();
      if (clean(body) && portions[0]?.index === 0
          && portions.reduce((n, match) => n + match[0].length, 0) === body.slice(12).length
          && portions.length === actual.length && portions.length > 0 && portions.every((portion) => {
        const index = actual.findIndex((item, i) => !used.has(i) && item
          && Number(item[1]) === Number(portion[1]) && clean(portion[2])
          && hitNamesPhrase(item[2], portion[2]));
        if (index < 0) return false;
        used.add(index);
        return true;
      })) { onExempt?.(); return false; }
    }
    reported = undefined;
    return true;
  }).join(" ");
}

/** Words a meal title may add around its own foods: joiners, cooking methods, the dish's shape. */
const TITLE_FILLER = new Set(("and & with plus on over of a the side bowl plate meal dinner lunch "
  + "breakfast snack grilled roasted baked steamed boiled fried pan-fried sauteed sautéed scrambled "
  + "poached toasted cooked raw fresh plain").split(" "));

/**
 * Words before a food's head noun that do not change what the food is for a diet rule ("White rice",
 * "Chicken breast, roasted"). Any other word before it ("Almond milk", "Turkey bacon", "Cauliflower
 * rice") is part of the food's identity, so a title that drops it names a different food.
 */
const NON_IDENTITY = new Set(("white brown wild long-grain basmati jasmine lean boneless skinless "
  + "large small medium fresh frozen organic baby extra virgin unsalted salted").split(" "));

/**
 * Weak-spot audit 2026-11-17 item 6: the titles of meals this turn's `set_slot_meal` actions set
 * ("Grilled chicken and rice"), when every item grounded to an allowed food and every other word
 * of the title is one of those items' own words or filler. Such a title names the meal, not a
 * food, so the reply scan does not look it up as one. Mirrors withoutPlanReports above for a plan
 * read; an ungrounded or unchecked item, or a title word naming any other food, keeps the title.
 */
export function plannedMealTitles(actions: readonly { kind: string }[]): string[] {
  return actions.flatMap((action) => {
    if (action.kind !== "set_slot_meal") return [];
    const { title, items } = action as { title?: unknown; items?: unknown };
    if (typeof title !== "string" || !clean(title) || !Array.isArray(items) || items.length === 0) return [];
    const checked = items.every((item: { foodRefId?: unknown; verdict?: unknown; name?: unknown }) =>
      typeof item.foodRefId === "string" && item.verdict === "allowed" && typeof item.name === "string");
    if (!checked) return [];
    const words = (s: string) => key(s).split(/[^a-z0-9&'-]+/).filter(Boolean);
    const singular = (w: string) => w.replace(/(?:es|s)$/, "");
    const own = new Set(items.flatMap((item: { name: string }) => words(item.name)).flatMap((w) => [w, singular(w)]));
    const titleWords = words(title);
    const inTitle = new Set(titleWords.flatMap((w) => [w, singular(w)]));
    // Each item a title word comes from must keep its identity words: the words of its name (before
    // the first comma) ahead of the first one the title uses, minus descriptors that keep the food (Sol review 2026-11-18).
    const keepsIdentity = items.every((item: { name: string }) => {
      const head = words(item.name.split(",")[0] ?? "");
      const first = head.findIndex((w) => inTitle.has(w) || inTitle.has(singular(w)));
      if (first < 0) return true;
      // Words before the first one the title uses qualify it ("almond" milk); words after it
      // name a cut or form ("chicken breast") and may drop.
      return head.slice(0, first).every((w) => NON_IDENTITY.has(w) || TITLE_FILLER.has(w));
    });
    return keepsIdentity
      && titleWords.every((w) => TITLE_FILLER.has(w) || own.has(w) || own.has(singular(w)))
      ? [title] : [];
  });
}

/**
 * Removes the first mention of each planned meal title (whole phrase, any case) from the text the
 * scan reads: that mention is the action's confirmation. Any later mention is advice and is scanned.
 */
export function withoutPlannedMealTitles(text: string, titles: readonly string[]): string {
  return titles.reduce((out, title) => {
    const pattern = key(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    return out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`, "iu"), "$1");
  }, text);
}
