import { describe, expect, it } from "vitest";
import { startReplyScan } from "@/lib/server/reply-check";
import { checkReply } from "@/lib/coach/reply-check";
import { withoutLogConfirmations } from "@/lib/coach/log-confirmation";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

const entry = { foodRefId: "bread", allergenTags: ["gluten"], category: [],
  onEatsList: true, onAvoidList: false };
const evidence = { "Bread, sourdough": entry };
const profile = { ...EMPTY_PROFILE, avoid_allergens: ["gluten"] };
const planReads = [{ date: "2026-11-22", slots: [{ slot: "meal-4", label: "Meal 4",
  title: "Sourdough toast, bacon & eggs", time: "08:00", state: "pending",
  items: ["75 g Bread, sourdough - 180 kcal", "75 g Bacon - 120 kcal", "75 g Eggs - 100 kcal"] }] }];
const ports = { searchFoods: async () => [], profileRules: async () => null };

describe("factual existing-plan reports and already-eaten records", () => {
  it.each([
    "Sourdough toast, bacon & eggs. It is planned for 08:00 on November 22.",
    "On November 22, your breakfast is Sourdough toast, bacon & eggs at 08:00. It includes 75 g of sourdough bread, 75 g of bacon, and 75 g of eggs.",
  ])("reports only the actual fetched plan despite today's rules: %s", async (text) => {
    const input = { userId: "u", text, named: [], evidence, profile, planReads };
    expect((await startReplyScan(input, ports, Date.now() + 1000)).failing).toEqual([]);
    expect(checkReply({ ...input, draft: null, actions: [] }).content).toBe(text);
  });

  it.each([
    "On November 23, your breakfast is Sourdough toast, bacon & eggs.",
    "On November 22, your dinner is Sourdough toast, bacon & eggs.",
    "On November 22, your breakfast is Sourdough toast, bacon & eggs at 09:00.",
    "Sourdough toast, bacon & eggs. Try sourdough bread again for dinner.",
  ])("does not clear mismatched facts or additional advice: %s", async (text) => {
    const scan = await startReplyScan({ userId: "u", text, named: [], evidence, profile, planReads },
      ports, Date.now() + 1000);
    expect(scan.failing.length).toBeGreaterThan(0);
  });

  it("cannot report an unfetched plan or incorrect ingredient amounts", async () => {
    const text = "On November 22, your breakfast is Sourdough toast, bacon & eggs. It includes 150 g of sourdough bread.";
    const scan = await startReplyScan({ userId: "u", text, named: [], evidence, profile, planReads },
      ports, Date.now() + 1000);
    expect(scan.failing.length).toBeGreaterThan(0);
    expect((await startReplyScan({ userId: "u", text, named: [], evidence, profile }, ports,
      Date.now() + 1000)).failing.length).toBeGreaterThan(0);
  });

  it("binds both destinations and removes only a known warning paired with the actual server notice", () => {
    const text = "Logged 300 g of spaghetti bolognese as a snack at 01:14. This is off-plan as it contains gluten and onion/garlic.";
    const items = [{ name: "Spaghetti bolognese", grams: 300, foodRefId: "spaghetti",
      slot: "snack", at: "01:14", verdict: "blocked" }];
    const held = { "Spaghetti bolognese": { ...entry, foodRefId: "spaghetti" } };
    expect(withoutLogConfirmations(text, items, held, ["Off-plan: Spaghetti bolognese."]))
      .toContain("onion/garlic");
    const knownWarning = text.replace("gluten and onion/garlic", "gluten");
    expect(withoutLogConfirmations(knownWarning, items, held, ["Off-plan: Spaghetti bolognese."])).toBe("");
    expect(withoutLogConfirmations(knownWarning, items, held)).toContain("off-plan");
    expect(withoutLogConfirmations(`${text} Try spaghetti bolognese for dinner.`, items, held))
      .toContain("Try spaghetti bolognese for dinner.");
    expect(withoutLogConfirmations(text, [{ ...items[0], at: "02:14" }], held)).toContain("Logged");
    expect(withoutLogConfirmations(text, [], held)).toBe(text);
  });
});
