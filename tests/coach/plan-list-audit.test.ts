import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { hasMismatchedListConfirmation, withoutListMarkConfirmations } from "@/lib/coach/list-mark-confirmation";
import { planRead, withoutPlanReports } from "@/lib/coach/plan-report";
import { newModelState } from "@/lib/server/coach-turn/model-state";
import { modelReply } from "@/lib/server/coach-turn/reply";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const slot = { slot: "meal-4", label: "Meal 4", title: "Tofu bowl", time: "08:00",
  state: "pending", items: ["75.5 g Tofu - 80 kcal"] };
const read = { date: "2026-11-22", slots: [slot] };
beforeEach(() => vi.stubEnv("TYPESAFE_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

async function report(request: string, text: string, rules = true, reads = [read], incomplete = false) {
  const state = newModelState([], 0);
  state.step = { kind: "final", text };
  state.planReads = reads;
  state.evidence = { Tofu: { foodRefId: REF, allergenTags: ["soy"], category: [],
    onEatsList: true, onAvoidList: false, catalogFoodRevisionId: 1 } };
  const turn = { req: { text: request }, newId: () => REF, userId: "u", client: {},
    replyDeadlineAt: Date.now() + 1000,
    clock: { date: "2026-11-15", now: "2026-11-15T12:00:00Z", tz: "UTC" },
  } as never;
  const kit = { profile: rules ? { ...EMPTY_PROFILE, avoid_allergens: ["soy"] } : EMPTY_PROFILE,
    profileInstances: [], foodEvidence: state.evidence, logEntryExists: async () => true,
    turnAbort: new AbortController(), replyPorts: {
      searchFoods: async () => [], profileRules: async () => {
        if (incomplete) throw new Error("unavailable");
        return null;
      },
    } } as never;
  return modelReply(turn, kit, { context: null } as never, state,
    { history: { summary: null }, intentMs: 0 } as never);
}

describe("plan facts and list confirmation audit controls", () => {
  it.each([
    ["add_to_avoid", "Added tofu to your Avoid list and removed it from your Avoid list."],
    ["remove_from_eats", "Removed tofu from your Favorites list and removed it from your Avoid list."],
  ])("rejects contradictory exclusive-list mirrors: %s", (kind, text) => {
    expect(hasMismatchedListConfirmation(text, [{ kind, name: "tofu" }])).toBe(true);
    expect(withoutListMarkConfirmations(text, [{ kind, name: "tofu" }])).toBe(text);
  });

  it("keeps the actual opposite-list mirror on an addition", () => {
    expect(withoutListMarkConfirmations("Added tofu to your Avoid list and removed it from your Favorites list.",
      [{ kind: "add_to_avoid", name: "tofu" }])).toBe("");
  });

  it("rejects an entire partial plan read instead of retaining only its valid slots", () => {
    expect(planRead({ ...read, slots: [slot, { slot: "meal-5" }] })).toBeNull();
    expect(planRead(read)).toEqual(read);
  });

  it("binds exact fractional grams and leaves changed fractions or later advice", () => {
    const prefix = "On November 22, your breakfast is Tofu bowl at 08:00.";
    expect(withoutPlanReports(`${prefix} It includes 75.5 g of tofu.`, [read])).toBe("");
    expect(withoutPlanReports(`${prefix} It includes 75.6 g of tofu.`, [read])).toContain("75.6");
    expect(withoutPlanReports(`${prefix} It includes 75.5 g of tofu. Try tofu for dinner.`, [read]))
      .toContain("Try tofu for dinner");
  });

  it.each([
    ["What's my dinner on November 22?", "Tofu bowl. It is planned for 08:00 on November 22."],
    ["What's my breakfast on November 23?", "Tofu bowl. It is planned for 08:00 on November 22."],
    ["What's my breakfast on November 22?", "Tofu bowl."],
  ])("does not report the wrong requested slot/date or an unbound bare title: %s", async (request, text) => {
    const result = await report(request, text);
    expect(result.content).not.toBe(text);
    expect(result.content).not.toContain("It is planned for");
  });

  it("reports actual saved facts with one honest not-rechecked notice under active rules", async () => {
    const result = await report("What's my breakfast a week from today?",
      "Tofu bowl. It is planned for 08:00 on November 22.");
    expect(result.content).toContain("Tofu bowl.");
    expect(result.content).toContain("Its foods were not re-checked against your current food rules.");
    expect(result.body.actions).toEqual([]);
  });

  it("does not add the notice with no rules and a complete scan", async () => {
    const result = await report("What's my breakfast a week from today?",
      "Tofu bowl. It is planned for 08:00 on November 22.", false);
    expect(result.content).not.toContain("not re-checked");
  });

  it("keeps the read caveat and fails closed when the profile scan cannot finish", async () => {
    const result = await report("What's my breakfast a week from today?",
      "Tofu bowl. It is planned for 08:00 on November 22.", false, [read], true);
    expect(result.content).toContain("not re-checked against your current food rules");
    expect(result.body.actions).toEqual([]);
  });

  it("does not exempt a stored title that itself asserts dietary safety", async () => {
    const unsafe = { ...slot, title: "Tofu is safe and soy-free" };
    const text = `${unsafe.title}. It is planned for 08:00 on November 22.`;
    const result = await report("What's my breakfast on November 22?", text, true,
      [{ ...read, slots: [unsafe] }]);
    expect(result.content).not.toContain("Tofu is safe and soy-free");
  });

  it("keeps same-food later advice and non-read requests outside the exception", async () => {
    const text = "Tofu bowl. It is planned for 08:00 on November 22. Have tofu again tomorrow.";
    expect((await report("What's my breakfast on November 22?", text)).content).not.toContain("Have tofu");
    const result = await report("Suggest breakfast", "Tofu bowl. It is planned for 08:00 on November 22.");
    expect(result.content).not.toContain("It is planned");
    expect(result.content).not.toContain("not re-checked");
  });
});
