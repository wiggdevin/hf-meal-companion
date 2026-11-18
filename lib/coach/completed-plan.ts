import { clockLabel, occasionAt } from "@/lib/meals/occasion";
import { isPlanReadRequest, planRead, planReadsForRequest, withoutPlanReports,
  type PlanRead } from "@/lib/coach/plan-report";

/** A single completed owner read can report its facts without generative advice or card mirrors. */
export function completedPlanReply(message: string, calls: readonly { name: string; ok: boolean }[],
  reads: readonly PlanRead[], today: string): string | null {
  if (!isPlanReadRequest(message) || calls.length !== 1 || calls[0].name !== "get_plan"
      || !calls[0].ok || reads.length !== 1 || !planRead(reads[0])) return null;
  const meal = /\bmy (breakfast|lunch|dinner|snack|plan|meal[- ]?[1-6])\b/i.exec(message)?.[1]
    .toLowerCase().replace(/meal[- ]?/, "meal-");
  if (!meal || meal === "plan") return null;
  const selected = planReadsForRequest(reads, message, today);
  if (selected.length !== 1 || selected[0].slots.length !== 1) return null;
  const slot = selected[0].slots[0];
  if (!["pending", "eaten"].includes(slot.state) || slot.items.length === 0
      || clockLabel(slot.time) !== slot.time) return null;
  const key = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const labels = [key(slot.label), key(slot.slot), occasionAt(slot.time)];
  if (!labels.includes(meal)) return null;
  const portions = slot.items.map((item) => /^(\d+(?:\.\d+)?)\s*g\s+(.+?)\s+-\s+/.exec(item));
  if (portions.some((portion) => portion === null)) return null;
  const items = portions.map((portion) => `${Number(portion![1])} g ${portion![2]}`);
  const list = items.length === 1 ? items[0]
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  const date = new Date(`${selected[0].date}T12:00:00Z`).toLocaleDateString("en-US",
    { month: "long", day: "numeric", timeZone: "UTC" });
  const text = `On ${date}, your ${meal} is ${slot.title} at ${slot.time}. It includes ${list}.`;
  // Reuse the existing exact authored-fact exemption as the final authority. Unsafe titles,
  // item names or any formatter drift keep the ordinary model-and-policy path.
  return withoutPlanReports(text, selected) === "" ? text : null;
}
