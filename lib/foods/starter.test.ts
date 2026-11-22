import { describe, expect, it } from "vitest";
import { starterChoices, initialStarterSelection, starterFood, mentionedFoodChoices, starterSelectionValid,
  starterSelectionProblem, starterProblemMessage, starterRoleRequirement, starterShortRoles,
  STARTERS } from "./starter";
import { legacyInstanceFromCatalog } from "@/lib/policy/profiles/legacy-flags";
import type { ProfileInstance, RuleId } from "@/lib/policy/profiles/types";

import { profileInstancesForLegacyFlags } from "@/lib/policy/profiles/legacy-flags";

const emptyRules = { avoid_allergens: [], avoid_food_ref_ids: [], banned_categories: [], conditions: [], notes: null };

describe("account-safe starter foods", () => {
  it("has a real bundled catalog for every role and does not inherit original-client bans", () => {
    const choices = starterChoices([], emptyRules);
    for (const role of ["protein", "carb", "fat"] as const) {
      expect(choices.filter((item) => item.role === role).length).toBeGreaterThanOrEqual({ protein: 8, carb: 8, fat: 6 }[role]);
    }
    expect(choices.some((item) => item.id === "apple-with-skin")).toBe(true);
    expect(choices.some((item) => item.id === "white-bread")).toBe(true);
    expect(choices.some((item) => item.id === "whey-protein-powder")).toBe(true);
  });

  it("filters explicit diet, allergens, and category rules", () => {
    const vegan = starterChoices(["vegan"], emptyRules);
    expect(vegan.some((item) => item.id === "chicken-breast-roasted" || item.id === "egg-white" || item.id === "whey-protein-powder")).toBe(false);
    const restricted = starterChoices([], { ...emptyRules, avoid_allergens: ["dairy", "peanuts"], banned_categories: ["apple", "gluten"] });
    expect(restricted.some((item) => ["apple-with-skin", "white-bread", "whey-protein-powder", "peanut-butter"].includes(item.id))).toBe(false);
    expect(starterChoices(["no_soy"], emptyRules).some((item) => item.id === "tofu-firm")).toBe(false);
    expect(starterChoices([], { ...emptyRules, avoid_allergens: ["soy"] })
      .some((item) => item.id === "tofu-firm")).toBe(false);
    // A starter has no food-ref id to compare with, so an Avoid list cannot be checked: fail closed.
    expect(starterChoices([], { ...emptyRules, avoid_food_ref_ids: ["unmapped-ref"] })).toEqual([]);
    expect(starterChoices([], { ...emptyRules, avoid_allergens: ["tree nuts", "milk"] })
      .some((item) => item.id === "almonds" || item.id === "whey-protein-powder")).toBe(false);
  });

  it("keeps reviewed diet choices when saved flags also arrive as profile rules", () => {
    for (const flags of [["vegetarian", "no_pork", "no_beef"], ["vegan"], ["pescatarian"]] as const) {
      const instances = profileInstancesForLegacyFlags(flags, "2026-09-01");
      expect(starterChoices(flags, emptyRules, instances).map((item) => item.id))
        .toEqual(starterChoices(flags, emptyRules).map((item) => item.id));
    }
  });

  it("excludes only the starters that carry a confirmed allergy, never the whole list", () => {
    const all = starterChoices([], emptyRules).map((item) => item.id);
    const carriers: Record<string, string[]> = {
      no_soy: ["tofu-firm", "tempeh"], no_eggs: ["egg-white"],
      no_peanuts: ["peanut-butter", "almonds", "pumpkin-seeds"], no_shellfish: [],
    };
    for (const flag of ["no_soy", "no_eggs", "no_peanuts", "no_shellfish"] as const) {
      const ids = starterChoices([flag], emptyRules,
        profileInstancesForLegacyFlags([flag], "2026-09-01")).map((item) => item.id);
      expect(ids.length).toBeGreaterThan(0);
      for (const out of carriers[flag]) expect(ids).not.toContain(out);
      // Only the carriers go (a few more for soy and eggs: edamame, whey, bread); the rest stay.
      expect(ids.length).toBeGreaterThanOrEqual(all.length - 8);
    }
  });

  it("peanut allergy keeps a non-empty list and offers no peanut-containing starter", () => {
    const peanut = legacyInstanceFromCatalog("allergy_peanut", "2026-09-01")!;
    const ids = starterChoices([], emptyRules, [peanut]).map((item) => item.id);
    expect(ids.length).toBeGreaterThan(20);
    for (const item of STARTERS.filter((x) => ids.includes(x.id))) {
      expect([...(item.allergens ?? []), ...(item.mayContain ?? [])].join(" ")).not.toMatch(/peanut/);
    }
    expect(ids).not.toContain("peanut-butter");
    expect(ids).not.toContain("almonds");
    expect(starterShortRoles(starterChoices([], emptyRules, [peanut]))).toEqual([]);
  });

  it("stored halal withholds uncertified chicken and beef and leaves a starter-free list that can still save", () => {
    const halal = legacyInstanceFromCatalog("halal", "2026-09-01")!;
    const noBeef = profileInstancesForLegacyFlags(["no_beef"], "2026-09-01");
    // No draft flag: the stored profile alone holds halal, and nothing in the bundled list is certified.
    const stored = starterChoices([], emptyRules, [halal]).map((item) => item.id);
    expect(stored).not.toContain("chicken-breast-roasted");
    expect(stored).not.toContain("ground-beef-90-10-cooked");
    const choices = starterChoices(["halal", "no_beef"], emptyRules, [halal, ...noBeef]);
    expect(choices.map((item) => item.id)).not.toContain("pork-tenderloin-roasted");
    // Withheld means withheld, not "assume fine": the person finishes with no starters at all.
    expect(starterRoleRequirement("protein", choices)).toBe(0);
    expect(starterSelectionValid([], choices)).toBe(true);
    expect(starterSelectionProblem([], ["halal", "no_beef"], emptyRules, [halal, ...noBeef])).toBeNull();
  });

  it("excludes a starter whose rule facet is uncurated by itself, not the others", () => {
    const uncurated: ProfileInstance = { profileId: "texture", source: "user_stated",
      confirmedAt: "2026-09-01", options: {}, rules: [{
        id: "texture::contains_ingredient:zzz-unknown-term" as RuleId, profileId: "texture",
        facet: "contains_ingredient:zzz-unknown-term", strength: "never",
        hardBasis: "user_rule", evidenceStrength: null, confirmation: "confirmed", expiresAt: null }] };
    // No starter can be proven free of an unknown ingredient, so each is held individually; a
    // known term still clears the rest, which shows exclusion is per starter, not a blanket.
    expect(starterChoices([], emptyRules, [uncurated])).toEqual([]);
    const beef: ProfileInstance = { ...uncurated, profileId: "legacy_no_beef", rules: [{
      ...uncurated.rules[0], id: "legacy_no_beef::contains_ingredient:beef" as RuleId,
      profileId: "legacy_no_beef", facet: "contains_ingredient:beef" }] };
    const ids = starterChoices([], emptyRules, [beef]).map((item) => item.id);
    expect(ids).not.toContain("ground-beef-90-10-cooked");
    expect(ids.length).toBe(STARTERS.length - 1);
  });

  it("lowers the floor to what a role has, and names the problem when a pick breaks a rule", () => {
    const poultryFree = starterChoices([], { ...emptyRules, banned_categories: ["poultry"] });
    expect(starterRoleRequirement("protein", poultryFree)).toBe(2);
    const one = poultryFree.filter((item) => item.role === "protein").slice(0, 1);
    expect(starterRoleRequirement("protein", one)).toBe(1);
    expect(starterRoleRequirement("fat", [])).toBe(0);
    const problem = starterSelectionProblem(["chicken-breast-roasted"], [],
      { ...emptyRules, banned_categories: ["poultry"] });
    expect(problem).toMatchObject({ kind: "rule", foodName: expect.stringMatching(/^Chicken breast/) });
    expect(starterProblemMessage(problem!)).toMatch(/doesn't fit your .*Go back to Foods/);
  });

  it("preserves this account's saved Avoid and neutral marks when setup is reopened", () => {
    const foods = [starterFood("whey-protein-powder", "avoid"), starterFood("tofu-firm", "neutral")];
    const marks = initialStarterSelection(["vegetarian"], emptyRules, "I love tofu", [], foods);
    expect(marks["whey-protein-powder"]).toBe("avoid");
    expect(marks["tofu-firm"]).toBe("neutral");
    expect(marks["egg-white"]).toBe("eats");
    expect(initialStarterSelection(["vegan"], emptyRules, "", [],
      [starterFood("egg-white", "eats")])["egg-white"]).not.toBe("eats");
  });

  it("holds starters when an active clinical hard rule cannot be cleared from catalog evidence", () => {
    const instances = [{ profileId: "medical", source: "user_stated" as const,
      confirmedAt: "2026-09-01", options: {}, rules: [{
        id: "medical::high_sodium" as import("@/lib/policy/profiles/types").RuleId,
        profileId: "medical", facet: "high_sodium", strength: "never" as const,
        hardBasis: "user_confirmed_safety" as const, evidenceStrength: "strong" as const,
        confirmation: "confirmed" as const, expiresAt: null,
      }] }];
    expect(starterChoices([], emptyRules, instances)).toEqual([]);
  });

  it("uses explicit nearby words to mark food mentions, with avoid taking precedence", () => {
    const choices = starterChoices([], emptyRules);
    const marks = mentionedFoodChoices("I love tofu, want more apples, avoid egg whites and don't eat peanut butter", choices);
    expect(marks.get("tofu-firm")).toBe("eats");
    expect(marks.get("apple-with-skin")).toBe("eats");
    expect(marks.get("egg-white")).toBe("avoid");
    expect(marks.get("peanut-butter")).toBe("avoid");
    expect(mentionedFoodChoices("I know tofu exists", choices).has("tofu-firm")).toBe(false);
    expect(mentionedFoodChoices("I love tofu no problem", choices).get("tofu-firm")).toBe("eats");
    expect(mentionedFoodChoices("I eat salmon, no complaints", choices)
      .get("salmon-wild-sockeye-cooked")).toBe("eats");
  });

  it("requires two selected foods per role and converts to household portions", () => {
    const choices = starterChoices(["vegan"], emptyRules);
    expect(starterSelectionValid(choices.slice(0, 2).map((item) => item.id), choices)).toBe(false);
    const selected = ["tofu-firm", "tempeh", "white-rice-cooked", "quinoa-cooked", "olive-oil", "avocado"];
    expect(starterSelectionValid(selected, choices)).toBe(true);
    const tofu = starterFood("tofu-firm", "eats");
    expect(tofu.unit).toBe("oz");
    expect(tofu.perUnit.protein).toBeGreaterThan(0);
  });
});
