import { describe, expect, it } from "vitest";
import { completedPlanReply } from "@/lib/coach/completed-plan";
import { planRead, withoutPlanReports, type PlanRead } from "@/lib/coach/plan-report";

const slot = { slot: "meal-4", label: "Meal 4", title: "Sourdough toast, bacon & eggs",
  time: "08:00", state: "pending", items: ["75 g Bread, sourdough - 200 kcal",
    "75 g Bacon, pan-fried - 325 kcal", "37.5 g Eggs, cooked - 55 kcal"] };
const read: PlanRead = { date: "2026-11-22", slots: [slot] };
const request = "What's my breakfast a week from today?";
const calls = [{ name: "get_plan", ok: true }];
const reply = (message = request, reads: PlanRead[] = [read], tools = calls) =>
  completedPlanReply(message, tools, reads, "2026-11-15");

describe("a completed plan report is an exact authored fact", () => {
  it.each([1, 2, 3])("renders %s actual items in the existing accepted grammar", (count) => {
    const selected = { ...read, slots: [{ ...slot, items: slot.items.slice(0, count) }] };
    const text = reply(request, [selected]);
    expect(text).not.toBeNull();
    expect(text).toContain(`On November 22, your breakfast is ${slot.title} at 08:00.`);
    expect(withoutPlanReports(text!, [selected])).toBe("");
    expect(text).not.toContain("not re-checked"); // The live guard owns its conditional caveat.
    if (count === 3) expect(text).toContain("37.5 g Eggs, cooked");
    if (count === 1) expect(text).not.toContain(" and ");
  });

  it("accepts an actual eaten slot and an explicit account slot id", () => {
    expect(reply("Show me my meal 4 on 2026-11-22.",
      [{ ...read, slots: [{ ...slot, state: "eaten" }] }])).toContain("your meal-4");
  });

  it("selects the requested account clock from a complete multi-slot day read", () => {
    expect(reply(request, [{ ...read, slots: [slot, { ...slot, slot: "meal-1", time: "18:00",
      title: "Rice bowl" }] }])).toContain(`your breakfast is ${slot.title}`);
  });

  it.each(["What's my plan a week from today?", "What's my breakfast a week from today and is it safe?",
    "Swap my breakfast a week from today", "What's my breakfast on November 22 then recommend dinner?",
    "What's my breakfast next made-up day?"])("keeps the model path for an unbound request: %s", (message) => {
    expect(reply(message)).toBeNull();
  });

  it.each([[], [{ name: "get_plan", ok: false }], [...calls, { name: "search_foods", ok: true }],
    [...calls, ...calls]].map((tools) => [tools]))("requires exactly one successful call across all rounds: %j", (tools) => {
    expect(reply(request, [read], tools)).toBeNull();
  });

  it.each([
    [], [{ ...read, date: "2026-11-23" }], [read, read],
    [{ ...read, slots: [{ ...slot, time: "18:00" }] }],
    [{ ...read, slots: [slot, { ...slot, slot: "meal-2" }] }],
    [{ ...read, slots: [{ ...slot, state: "empty" }] }],
    [{ ...read, slots: [{ ...slot, state: "unknown" }] }],
    [{ ...read, slots: [{ ...slot, items: [] }] }],
  ].map((reads) => [reads]))("rejects wrong, incomplete, empty or ambiguous reads: %j", (reads) => {
    expect(reply(request, reads)).toBeNull();
  });

  it("receives no evidence from an entire malformed tool read", () => {
    const malformed = planRead({ ...read, slots: [slot, { slot: "meal-5" }] });
    expect(malformed).toBeNull();
    expect(reply(request, malformed ? [malformed] : [])).toBeNull();
  });

  it.each(["Tofu is safe", "Gluten-free toast", "Healthy oats", "Toast. Try tofu",
    "Toast; recommend tofu"])("rejects a stored title making advice or safety claims: %s", (title) => {
    expect(reply(request, [{ ...read, slots: [{ ...slot, title }] }])).toBeNull();
  });

  it.each(["2 slices toast - 80 kcal", "75 g toast", "75 g tofu recommended for dinner - 80 kcal",
    "75 g toast. Try tofu - 80 kcal"])("rejects unbound item content: %s", (item) => {
    expect(reply(request, [{ ...read, slots: [{ ...slot, items: [item] }] }])).toBeNull();
  });

  it("does not exempt later advice about the same authored food", () => {
    const text = reply()!;
    expect(withoutPlanReports(`${text} Try sourdough toast for dinner.`, [read]))
      .toBe("Try sourdough toast for dinner.");
  });
});
