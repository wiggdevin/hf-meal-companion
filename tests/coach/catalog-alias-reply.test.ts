import { describe, expect, it } from "vitest";
import { foodEvidenceFor } from "@/lib/coach/food-evidence";
import { hitNamesPhrase } from "@/lib/coach/reply-mentions";
import { withoutLogConfirmations } from "@/lib/coach/log-confirmation";
import { cardEvidence } from "@/lib/coach/reply-check";
import { startReplyScan } from "@/lib/server/reply-check";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import type { EvidenceByName } from "@/lib/coach/policy";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const entry = (foodRefId = REF, onAvoidList = false): EvidenceByName[string] => ({
  foodRefId, allergenTags: [], category: [], onEatsList: true, onAvoidList,
});
const evidence = { "Chicken breast, roasted": entry() };

describe("catalog-qualified labels in coach replies", () => {
  it.each([
    "I have built a meal using chicken and corn tortillas.",
    "Next Tuesday's lunch is set to 150 g roasted chicken and 160 g rice.",
  ])("checks the actual chicken identity behind generic prose: %s", async (text) => {
    const scan = await startReplyScan({ userId: "u", text, named: [], evidence: {
      ...evidence, "Corn tortilla": entry("corn"), "Rice, white, cooked": entry("rice"),
    }, profile: { ...EMPTY_PROFILE, avoid_food_ref_ids: ["other"] } }, {
      searchFoods: async () => [], profileRules: async () => null,
    }, Date.now() + 1000);
    expect(scan.complete).toBe(true);
    expect(scan.failing).toEqual([]);
  });

  it.each(["I have built a chicken wrap.", "Next Tuesday's lunch is set to grilled chicken."])(
    "holds a dish or preparation the plain roasted identity does not prove: %s", async (text) => {
      // Earlier synthetic expectations allowed these through the bare chicken noun. The final
      // audit proved that behavior could also clear breaded/raw preparations and mixed dishes.
      const result = await startReplyScan({ userId: "u", text, named: [], evidence,
        profile: { ...EMPTY_PROFILE, avoid_allergens: ["gluten"] } }, {
        searchFoods: async () => [], profileRules: async () => null,
      }, Date.now() + 1000);
      expect(result.failing.length).toBeGreaterThan(0);
    });

  it("uses the actual qualified oatmeal/blueberry identities for raw suggestion mirrors", () => {
    const held = { "Oatmeal, cooked with water": entry(), "Blueberries, raw": entry("berry") };
    expect(cardEvidence({ name: "oatmeal" }, held).foodRefId).toBe(REF);
    expect(cardEvidence({ name: "blueberries" }, held).foodRefId).toBe("berry");
    expect(cardEvidence({ name: "oatmeal", foodRefId: "forged" }, held).foodRefId).toBeNull();
  });

  it("binds the actual cooked-white-rice confirmation, amount and clock", () => {
    const text = "Logged 1 g of cooked white rice at 01:14.";
    const rice = { "Rice, white, cooked": entry() };
    expect(withoutLogConfirmations(text,
      [{ name: "Rice, white, cooked", grams: 1, foodRefId: REF, at: "01:14" }], rice)).toBe("");
    for (const invalid of ["Logged 1 g of raw white rice at 01:14.",
      "Logged 2 g of cooked white rice at 01:14.", "Logged 1 g of cooked white rice at 02:14."]) {
      expect(withoutLogConfirmations(invalid,
        [{ name: "Rice, white, cooked", grams: 1, foodRefId: REF, at: "01:14" }], rice)).toBe(invalid);
    }
  });

  it.each(["fried chicken", "breaded chicken", "chicken salad", "soy chicken", "shrimp chicken"])(
    "never clears a different preparation or mixed dish: %s", (name) => {
      expect(hitNamesPhrase("Chicken breast, roasted", name)).toBe(false);
      expect(foodEvidenceFor(evidence, name)).toBeUndefined();
    });

  it("does not turn a mixed catalog dish into plain chicken", () => {
    expect(hitNamesPhrase("Chicken salad", "chicken")).toBe(false);
    expect(hitNamesPhrase("Soy chicken", "chicken")).toBe(false);
  });

  it("holds generic aliases shared by distinct refs", () => {
    expect(foodEvidenceFor({ ...evidence, "Chicken thigh, roasted": entry("other") }, "chicken"))
      .toMatchObject({ foodRefId: null, ambiguous: true });
  });

  it("also holds the generic prose when two actual cuts resolve to different refs", async () => {
    const scan = await startReplyScan({ userId: "u", text: "Try chicken.", named: [], evidence: {
      ...evidence, "Chicken thigh, roasted": entry("other"),
    }, profile: { ...EMPTY_PROFILE, avoid_food_ref_ids: ["unrelated"] } }, {
      searchFoods: async () => [], profileRules: async () => null,
    }, Date.now() + 1000);
    expect(scan.failing).not.toEqual([]);
  });

  it("still blocks forbidden generic advice with the actual canonical facts", async () => {
    const scan = await startReplyScan({ userId: "u", text: "Try chicken for dinner.", named: [],
      evidence, profile: { ...EMPTY_PROFILE, avoid_food_ref_ids: [REF] } }, {
      searchFoods: async () => [], profileRules: async () => null,
    }, Date.now() + 1000);
    expect(scan.failing).toContainEqual(expect.objectContaining({ name: "Chicken breast, roasted",
      reason: expect.any(String) }));
  });
});
