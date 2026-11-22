/**
 * W062: the starter list has ONE authority, the shared evaluator (`suggestionItemsVerdict` →
 * `evaluatePolicy`). These tests drive the real evaluator against stored profiles (what the
 * server hands the client) and assert what is withheld. Anything not proven "allowed" is withheld;
 * curated starter data can only deny.
 */
import { describe, expect, it } from "vitest";
import {
  STARTERS, starterChoices, starterPolicyInputs, starterRuleHits, starterSelectionProblem, type Starter,
} from "./starter";
import { starterSuggestionEvidence } from "./starter-evidence";
import { profileInstancesForLegacyFlags } from "@/lib/policy/profiles/legacy-flags";
import { starterReadiness } from "./starter-availability";
import { profileDefinition } from "@/lib/policy/profiles/catalog";
import { buildProfileInstance } from "@/lib/policy/profiles/loader";
import type { ProfileInstance } from "@/lib/policy/profiles/types";
import type { SuggestionFoodEvidence } from "@/lib/coach/suggest-evidence-types";

const empty = { avoid_allergens: [] as string[], avoid_food_ref_ids: [] as string[],
  banned_categories: [] as string[], conditions: [] as string[], notes: null };
const AT = "2026-09-01";
/** A stored profile as the server returns it: every hard rule the person confirmed. */
const stored = (id: string): ProfileInstance[] => {
  const definition = profileDefinition(id);
  expect(definition, `catalog profile ${id}`).toBeDefined();
  return [buildProfileInstance(definition!, { source: "user_stated", confirmedAt: AT,
    confirmations: definition!.templates.filter((template) => template.strength === "never")
      .map((template) => ({ facet: template.facet, confirmed: true })) })];
};
const ids = (list: readonly Starter[]) => list.map((item) => item.id);
const offered = (profile: typeof empty & { custom_rules?: never }, instances: ProfileInstance[] = [],
  flags: string[] = []) => ids(starterChoices(flags, profile, instances));

describe("starter eligibility comes only from the shared evaluator", () => {
  it("offers a broad list to an account with no rules", () => {
    expect(offered(empty).length).toBeGreaterThan(30);
  });

  it("a stored pregnancy profile withholds both egg starters", () => {
    const list = offered(empty, stored("pregnancy"));
    expect(list).not.toContain("egg-white");
    expect(list).not.toContain("egg-whole-large");
  });

  it("a stored paleo profile withholds green beans", () => {
    const list = offered(empty, stored("paleo"));
    expect(list).not.toContain("green-beans-cooked");
  });

  it.each(["allergy_sesame", "allergy_crustacean"])("a stored %s withholds unlabeled bread and whey", (profileId) => {
    const list = offered(empty, stored(profileId));
    for (const id of ["white-bread", "whole-wheat-bread", "whey-protein-powder"]) expect(list, id).not.toContain(id);
  });

  it("a custom ingredient rule withholds peanut butter", () => {
    const custom = { ...empty, custom_rules: [{ id: "0b6f2d1c-4a53-4e0a-9b7a-2f1f5d9c8a11",
      kind: "ingredient" as const, text: "peanut butter" }] };
    expect(ids(starterChoices([], custom as never, []))).not.toContain("peanut-butter");
  });

  it("stored halal with no draft flag withholds uncertified chicken and beef", () => {
    const list = offered(empty, stored("halal"));
    expect(list).not.toContain("chicken-breast-roasted");
    expect(list).not.toContain("ground-beef-90-10-cooked");
  });

  it("an avoid ref with a cold ref cache does not offer the food (fail closed)", () => {
    // No device cache exists in this test at all; the avoided ref cannot be matched to a starter.
    const hits = starterRuleHits([], { ...empty, avoid_food_ref_ids: ["ref-chicken"] });
    for (const hit of hits.values()) expect(hit).not.toBeNull();
    expect(starterChoices([], { ...empty, avoid_food_ref_ids: ["ref-chicken"] })).toEqual([]);
  });

  it("withholds one starter at a time: a no-beef rule leaves the rest of the list", () => {
    const beef = starterChoices(["no_beef"], empty);
    expect(ids(beef)).not.toContain("ground-beef-90-10-cooked");
    expect(beef.length).toBeGreaterThan(30);
  });

  it("names the food and the rule when a picked starter is now withheld", () => {
    const picks = ["chicken-breast-roasted", "turkey-breast-roasted", "white-rice-cooked", "brown-rice-cooked",
      "olive-oil", "peanut-butter"];
    const problem = starterSelectionProblem(picks, [], { ...empty, avoid_allergens: ["peanuts"] });
    expect(problem).toMatchObject({ kind: "rule", foodName: expect.stringMatching(/^Peanut butter/) });
  });
});

describe("stored hard rules are never dropped for a flag that maps to the same profile", () => {
  it("no_shellfish plus a stored crustacean row still withholds unlabeled bread and whey", () => {
    const list = offered(empty, stored("allergy_crustacean"), ["no_shellfish"]);
    for (const id of ["white-bread", "whole-wheat-bread", "whey-protein-powder"]) expect(list, id).not.toContain(id);
  });

  it("no_shellfish plus a stored mollusc row keeps the stored rule", () => {
    expect(offered(empty, stored("allergy_mollusc"), ["no_shellfish"])).not.toContain("white-bread");
  });

  it("a synthesized flag instance is not added a second time as a profile rule", () => {
    const synthesized = profileInstancesForLegacyFlags(["no_shellfish"], AT);
    expect(synthesized.length).toBeGreaterThan(0);
    expect(synthesized.every((instance) => instance.derivedFromFlag === true)).toBe(true);
    const { profile } = starterPolicyInputs(["no_shellfish"], empty, synthesized, new Date(AT));
    expect(profile.profileRules?.items).toEqual([]);
  });

  it("a stored vegan row keeps its hard rules next to a vegan flag", () => {
    const { profile } = starterPolicyInputs(["vegan"], empty, stored("vegan"), new Date(AT));
    expect((profile.profileRules?.items ?? []).map((item) => item.facet)).toContain("honey");
  });
});

describe("a missing curated tag never clears an allergy (deny-only onboarding evidence)", () => {
  const blank: SuggestionFoodEvidence = {
    allergenTags: [], allergenEvidence: {}, checkedAllergens: [], ingredientsText: null,
    ingredientsTextIsLabel: false, foodName: "x", foodBrand: null, packaged: false,
    policyCategories: null, facets: {}, noCook: null, onEatsList: false, onAvoidList: false, role: "carb",
  };

  it("a stored egg allergy withholds unlabeled bread, whey, tortilla and peanut butter", () => {
    const list = offered(empty, stored("allergy_egg"));
    for (const id of ["white-bread", "whole-wheat-bread", "whey-protein-powder", "corn-tortilla", "peanut-butter"]) {
      expect(list, id).not.toContain(id);
    }
    expect(list).not.toContain("egg-white");
    expect(list).toContain("white-rice-cooked");
  });

  it.each([["allergy_peanut"], ["allergy_tree_nut"], ["allergy_milk"], ["allergy_soy"], ["celiac"]])(
    "a stored %s withholds unlabeled bread and the tortilla", (profileId) => {
      const list = offered(empty, stored(profileId));
      expect(list, profileId).not.toContain("white-bread");
      expect(list, profileId).not.toContain("corn-tortilla");
    });

  it("the onboarding evidence has no absent attestation for any facet", () => {
    for (const item of STARTERS) {
      const evidence = starterSuggestionEvidence(item, blank, { denyOnly: true });
      expect(Object.values(evidence.attestedFacets ?? {}), item.id).not.toContain("absent");
      for (const [facet, judgment] of Object.entries(evidence.facets)) {
        if (facet !== "human_food") expect(judgment?.p, `${item.id} ${facet}`).toBe(1);
      }
    }
  });

  it("the coach's default evidence is unchanged: it still attests absence", () => {
    const bread = STARTERS.find((item) => item.id === "white-bread")!;
    expect(Object.values(starterSuggestionEvidence(bread, blank).attestedFacets ?? {})).toContain("absent");
  });

  it("a banned category still finds a starter's curated category", () => {
    const list = ids(starterChoices([], { ...empty, banned_categories: ["poultry"] }));
    expect(list).not.toContain("chicken-breast-roasted");
    expect(list).toContain("white-rice-cooked");
  });
});

describe("a person whose rules leave nothing can still finish", () => {
  it("zero eligible proteins on a legacy 3-meal account is ready with no picks", () => {
    const halal = starterChoices([], empty, stored("halal"));
    expect(halal.filter((item) => item.role === "protein")).toEqual([]);
    const readiness = starterReadiness({}, halal, 3);
    expect(readiness).toMatchObject({ ready: true, starterFree: true });
    expect(readiness.proteins).toMatchObject({ eligible: 0, required: 0 });
  });

  it("a legacy account with two eligible proteins still needs only what exists, never three", () => {
    const two = STARTERS.filter((item) => ["tofu-firm", "tempeh", "white-rice-cooked", "quinoa-cooked", "olive-oil", "avocado-oil"].includes(item.id));
    const marks = Object.fromEntries(two.map((item) => [item.id, "eats" as const]));
    expect(starterReadiness(marks, two, 3).ready).toBe(true);
    expect(starterReadiness({ "tofu-firm": "eats" }, two, 3).ready).toBe(false);
  });
});

describe("curated starter data can only deny", () => {
  const blank: SuggestionFoodEvidence = {
    allergenTags: [], allergenEvidence: {}, checkedAllergens: [], ingredientsText: null,
    ingredientsTextIsLabel: false, foodName: "x", foodBrand: null, packaged: false,
    policyCategories: null, facets: {}, noCook: null, onEatsList: false, onAvoidList: false, role: "carb",
  };

  it("never attests absence of an allergen the starter may carry (mayContain)", () => {
    const withMay = STARTERS.filter((item) => (item.mayContain ?? []).length > 0);
    expect(withMay.length).toBeGreaterThan(3);
    const facetFor: Record<string, string> = { soy: "contains_soy", dairy: "contains_dairy",
      "tree-nut": "contains_tree_nut", peanut: "contains_peanut", gluten: "contains_gluten", wheat: "contains_gluten" };
    for (const item of withMay) {
      const evidence = starterSuggestionEvidence(item, blank);
      for (const allergen of item.mayContain ?? []) {
        const facet = facetFor[allergen];
        if (!facet) continue;
        expect(evidence.attestedFacets?.[facet as keyof typeof evidence.attestedFacets], `${item.id} ${allergen}`).toBe("present");
      }
    }
  });

  it("ships no curated facet table or allergen attestation list", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync(
      new URL("./starter-evidence.ts", import.meta.url), "utf8"));
    for (const name of ["CURATED_FACETS", "ALLERGENS_NO_STARTER_HAS", "ingredientTermNamed"]) {
      expect(source).not.toContain(name);
    }
  });
});
