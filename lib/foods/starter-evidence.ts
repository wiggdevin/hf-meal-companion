import type { SuggestionFoodEvidence } from "@/lib/coach/suggest-evidence-types";
import { RUBRIC_VERSION, type Facet } from "@/lib/foods/facet-vocabulary";
import type { Starter } from "@/lib/foods/starter";

/** Add facts proved by an exact bundled-starter row; conflicting cache facts can only deny. */
export function starterSuggestionEvidence(
  starter: Starter, current: SuggestionFoodEvidence,
): SuggestionFoodEvidence {
  // A cross-contact allergen (`mayContain`) is denying evidence exactly like a listed one: this
  // file never attests the absence of an allergen the starter may carry.
  const hasAllergen = (key: string) => starter.allergens?.includes(key) === true
    || starter.mayContain?.includes(key) === true;
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
    contains_gluten: hasAllergen("gluten") || hasAllergen("wheat"),
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
    allergenTags: [...new Set([...(starter.allergens ?? []), ...(starter.mayContain ?? [])])],
    policyCategories: [...(starter.categories ?? [])],
  };
}
