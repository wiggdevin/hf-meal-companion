import type { FacetOutcome } from "@/lib/policy/facet-rules";
import type { SuggestionFoodEvidence } from "@/lib/coach/suggest-evidence-types";
import { RUBRIC_VERSION, type Facet } from "@/lib/foods/facet-vocabulary";
import type { Starter } from "@/lib/foods/starter";
import { allergenKey } from "@/lib/policy/allergens";
import { ingredientTerms } from "@/lib/policy/profiles/hard-rules";

/** Add facts proved by an exact bundled-starter row; conflicting cache facts can only deny. */
export function starterSuggestionEvidence(
  starter: Starter, current: SuggestionFoodEvidence,
): SuggestionFoodEvidence {
  const hasAllergen = (key: string) => starter.allergens?.includes(key) === true;
  const hasCategory = (key: string) => starter.categories?.includes(key) === true;
  const derived: Partial<Record<Facet, boolean>> = {
    human_food: true,
    animal_product: !starter.diets.includes("vegan"),
    meat: !starter.diets.includes("pescatarian"),
    fish_seafood: starter.diets.includes("pescatarian")
      && !starter.diets.includes("vegetarian"),
    shellfish: hasAllergen("shellfish"),
    pork: hasCategory("pork"), beef: hasCategory("beef"),
    contains_dairy: hasAllergen("dairy"), contains_egg: hasAllergen("egg"),
    contains_soy: hasAllergen("soy"), contains_peanut: hasAllergen("peanut"),
    contains_tree_nut: hasAllergen("tree-nut"),
    contains_gluten: hasAllergen("gluten"),
    beans: hasCategory("beans"),
  };
  const judgedAt = new Date().toISOString();
  const facets = { ...current.facets };
  for (const [facet, present] of Object.entries(derived) as [Facet, boolean][]) {
    const attested = { p: present ? 1 : 0, rubricVersion: RUBRIC_VERSION, judgedAt };
    // A stale negative may never clear a curated prohibition. A conflicting positive
    // still blocks, and a cached human_food negative still withholds the food.
    if (present && facet !== "human_food") facets[facet] = attested;
    else facets[facet] ??= attested;
  }
  const attestedFacets = Object.fromEntries((Object.entries(derived) as [Facet, boolean][])
    .filter(([facet]) => facet !== "human_food")
    .map(([facet, present]) => [facet, present ? "present" : "absent"] as const));
  return {
    ...current, facets, attestedFacets,
    // Curated positives block; an empty legacy tag list still cannot clear an active allergy.
    allergenTags: [...(starter.allergens ?? [])],
    policyCategories: [...(starter.categories ?? [])],
  };
}


const hasAllergen = (item: Starter, key: string): boolean =>
  item.allergens?.includes(key) === true || item.mayContain?.includes(key) === true;
const hasCategory = (item: Starter, key: string): boolean => item.categories?.includes(key) === true;
const animalFlesh = (item: Starter): boolean => item.diets.length === 1 && item.diets[0] === "omnivore";
const GRAINS = new Set(["white-rice-cooked", "brown-rice-cooked", "quinoa-cooked", "oatmeal-cooked",
  "white-bread", "whole-wheat-bread", "corn-tortilla"]);
const ROOTS = new Set(["potato-baked-with-skin", "sweet-potato-baked"]);
const TYRAMINE = new Set(["tempeh", "greek-yogurt-plain-nonfat"]);
const SWEETENED = new Set(["whey-protein-powder"]);
const ADDED_SUGAR = new Set(["white-bread", "whole-wheat-bread", "whey-protein-powder"]);
const never = (): boolean => false;

/**
 * Curated, per-facet judgement for the reviewed starters (W062). Every facet the rule picker can
 * set as a hard rule is listed here or, deliberately, left out: a facet that is not here is
 * `unknown`, which only withholds that one starter (never the whole list). `never` marks a facet
 * that no bundled starter carries: each is a plain, single-ingredient whole food, cooked, with no
 * alcohol, blood, gelatin, honey, insect, shellfish or sesame in it. Canned light tuna is on the
 * FDA "best choices" list, so it is not high_mercury_fish.
 */
const CURATED_FACETS: Readonly<Record<string, (item: Starter) => boolean>> = {
  contains_dairy: (i) => hasAllergen(i, "dairy"),
  contains_egg: (i) => hasAllergen(i, "egg"),
  contains_soy: (i) => hasAllergen(i, "soy"),
  contains_peanut: (i) => hasAllergen(i, "peanut"),
  contains_tree_nut: (i) => hasAllergen(i, "tree-nut"),
  contains_gluten: (i) => hasAllergen(i, "gluten") || hasAllergen(i, "wheat"),
  contains_wheat: (i) => hasAllergen(i, "wheat"),
  contains_sesame: (i) => hasAllergen(i, "sesame"),
  contains_finfish: (i) => hasCategory(i, "fish"),
  shellfish: (i) => hasAllergen(i, "shellfish"),
  crustacean_shellfish: (i) => hasAllergen(i, "shellfish"),
  mollusc: (i) => hasAllergen(i, "shellfish"),
  contains_grain: (i) => GRAINS.has(i.id),
  root_vegetable: (i) => ROOTS.has(i.id),
  tyramine_rich: (i) => TYRAMINE.has(i.id),
  non_nutritive_sweetener: (i) => SWEETENED.has(i.id),
  aspartame: (i) => SWEETENED.has(i.id),
  beans: (i) => hasCategory(i, "beans"),
  poultry: (i) => hasCategory(i, "poultry"),
  red_meat: (i) => hasCategory(i, "beef") || hasCategory(i, "pork"),
  land_animal_flesh: (i) => hasCategory(i, "poultry") || hasCategory(i, "beef") || hasCategory(i, "pork"),
  mammalian_derived: (i) => hasCategory(i, "beef") || hasCategory(i, "pork") || hasAllergen(i, "dairy"),
  high_iodine: (i) => hasCategory(i, "fish") || hasAllergen(i, "dairy") || hasAllergen(i, "egg"),
  alcohol: never, blood_product: never, gelatin: never, honey: never, insect_derived: never,
  fish_without_fins_scales: never, mixes_meat_and_dairy: never, raw_or_undercooked_animal: never,
  unpasteurized: never, high_listeria_risk: never, high_mercury_fish: never, grapefruit_family: never,
  star_fruit: never, fava_bean: never, coffee_or_tea: never,
};

/** Allergens that no bundled starter carries, so a named one is `absent` on every starter. */
const ALLERGENS_NO_STARTER_HAS = new Set(["sesame", "shellfish", "crustacean", "sulfites", "mustard",
  "celery", "lupin", "mollusc"]);

function allergenNamed(item: Starter, rawName: string): boolean | null {
  const key = allergenKey(rawName);
  if (key === "gluten" || key === "wheat") return hasAllergen(item, "gluten") || hasAllergen(item, "wheat");
  if (["dairy", "egg", "soy", "peanut", "tree-nut", "apple"].includes(key)) return hasAllergen(item, key);
  if (key === "fish") return hasCategory(item, "fish") || hasAllergen(item, "fish");
  if (ALLERGENS_NO_STARTER_HAS.has(key)) return false;
  return null;
}

/** One free-text ingredient term of a `contains_ingredient:` rule: true, false, or null (unknown). */
function ingredientTermNamed(item: Starter, term: string): boolean | null {
  const t = term.toLowerCase().trim();
  if (/^(pork|ham|bacon)$/.test(t)) return hasCategory(item, "pork");
  if (/^(beef|veal)$/.test(t)) return hasCategory(item, "beef");
  if (/^(legumes?|beans?|lentils?|chickpeas?|peas?|peanuts?)$/.test(t)) {
    return hasCategory(item, "beans") || hasAllergen(item, "soy") || hasAllergen(item, "peanut");
  }
  if (/^(dairy|milk|cheese|butter|cream|yogurt)$/.test(t)) return hasAllergen(item, "dairy");
  if (/^(wine|beer|spirits|liqueur|cooking wine|alcohol|vinegar)$/.test(t)) return false;
  if (/^(sugar|syrup|sugars|syrups)$/.test(t)) return ADDED_SUGAR.has(item.id);
  return null;
}

function ingredientRule(item: Starter, description: string): FacetOutcome | null {
  const verdicts = ingredientTerms(description).map((term) => ingredientTermNamed(item, term));
  if (verdicts.length === 0) return null;
  if (verdicts.includes(true)) return "present";
  return verdicts.every((verdict) => verdict === false) ? "absent" : null;
}

/** Evidence applies only to the reviewed STARTERS catalog, never arbitrary names or labels.
 * Diet tags describe the complete starter, so they also clear matching saved profile rules.
 * `null` means the starter's own evidence does not cover that facet: the caller then falls back
 * to the generic policy evidence, which rarely clears a food, so that starter alone is withheld. */
export function starterFacetOutcome(item: Starter, facet: string): FacetOutcome | null {
  if (facet === "meat") return animalFlesh(item) ? "present" : "absent";
  if (facet === "fish_seafood") return hasCategory(item, "fish") ? "present" : "absent";
  if (facet === "animal_product") return item.diets.includes("vegan") ? "absent" : "present";
  if (facet === "pork") return hasCategory(item, "pork") ? "present" : "absent";
  if (facet === "beef") return hasCategory(item, "beef") ? "present" : "absent";
  const curated = CURATED_FACETS[facet];
  if (curated) return curated(item) ? "present" : "absent";
  if (facet.startsWith("contains_allergen:")) {
    const named = allergenNamed(item, facet.slice("contains_allergen:".length));
    return named === null ? null : named ? "present" : "absent";
  }
  if (facet.startsWith("contains_ingredient:")) return ingredientRule(item, facet.slice("contains_ingredient:".length));
  return null;
}
