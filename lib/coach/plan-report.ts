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
