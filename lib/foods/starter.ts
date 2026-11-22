/** Curated, account-filtered starters from the bundled USDA food list. */
import { starterSuggestionEvidence } from "./starter-evidence";
import { dbFood } from "@/lib/food-db";
import type { Profile } from "@/lib/constraints-client";
import type { Food, FoodRole, FoodStatus, FoodUnit } from "@/lib/foods";
import type { ProfileInstance } from "@/lib/policy/profiles/types";
import { activeHardRulesFor } from "@/lib/policy/profiles/account-rules";
import type { ConstraintProfile } from "@/lib/policy/constraints";
import { suggestionFoodIdentity, suggestionItemsVerdict } from "@/lib/coach/suggest-verdict";
import {
  LEGACY_PREFERENCE_FLAGS, legacyProfileIdsFor, type LegacyPreferenceFlag,
} from "@/lib/policy/profiles/legacy-flags";

export type DietStyle = "omnivore" | "pescatarian" | "vegetarian" | "vegan";
export type Starter = { id: string; role: FoodRole; unit: FoodUnit; grams: number; diets: readonly DietStyle[]; allergens?: readonly string[];
  /** Cross-contact or common-recipe allergens (oats and gluten, nuts and peanuts): they count as present for a hard allergy rule. */
  mayContain?: readonly string[]; categories?: readonly string[]; default?: boolean };
const ALL = ["omnivore", "pescatarian", "vegetarian", "vegan"] as const;
const ANIMAL = ["omnivore", "pescatarian", "vegetarian"] as const;
const SEA = ["omnivore", "pescatarian"] as const;
const LAND = ["omnivore"] as const;
const S = (id: string, role: FoodRole, unit: FoodUnit, grams: number, diets: readonly DietStyle[], extra: Partial<Starter> = {}): Starter => ({ id, role, unit, grams, diets, ...extra });

export const STARTERS: readonly Starter[] = [
  S("chicken-breast-roasted", "protein", "oz", 28.35, LAND, { categories: ["poultry"], default: true }),
  S("turkey-breast-roasted", "protein", "oz", 28.35, LAND, { categories: ["poultry"], default: true }),
  S("ground-beef-90-10-cooked", "protein", "oz", 28.35, LAND, { categories: ["beef"] }),
  S("pork-tenderloin-roasted", "protein", "oz", 28.35, LAND, { categories: ["pork"] }),
  S("salmon-wild-sockeye-cooked", "protein", "oz", 28.35, SEA, { categories: ["fish"], allergens: ["fish"], default: true }),
  S("tuna-canned-in-water-light", "protein", "oz", 28.35, SEA, { categories: ["fish"], allergens: ["fish"], default: true }),
  S("cod-cooked", "protein", "oz", 28.35, SEA, { categories: ["fish"], allergens: ["fish"] }),
  S("egg-white", "protein", "cup", 243, ANIMAL, { allergens: ["egg"], default: true }),
  S("whey-protein-powder", "protein", "cup", 96, ANIMAL, { allergens: ["dairy"], mayContain: ["soy"], default: true }),
  // Breakfast anchors (Phase 17 O1): without them a new account's 07:30 plate had only egg white,
  // whey or tofu to lead it.
  S("egg-whole-large", "protein", "whole", 50, ANIMAL, { allergens: ["egg"], default: true }),
  S("greek-yogurt-plain-nonfat", "protein", "cup", 245, ANIMAL, { allergens: ["dairy"], default: true }),
  S("tofu-firm", "protein", "oz", 28.35, ALL, { allergens: ["soy"], default: true }),
  S("tempeh", "protein", "oz", 28.35, ALL, { allergens: ["soy"], mayContain: ["gluten", "wheat"], default: true }),
  S("edamame-cooked", "protein", "cup", 155, ALL, { allergens: ["soy"], categories: ["beans"], default: true }),
  S("lentils-cooked", "protein", "cup", 198, ALL, { categories: ["beans"], default: true }),
  S("black-beans-cooked", "protein", "cup", 172, ALL, { categories: ["beans"], default: true }),
  S("chickpeas-cooked", "protein", "cup", 164, ALL, { categories: ["beans"] }),
  S("white-beans-cooked", "protein", "cup", 179, ALL, { categories: ["beans"] }),
  S("white-rice-cooked", "carb", "cup", 158, ALL, { default: true }),
  S("brown-rice-cooked", "carb", "cup", 195, ALL, { default: true }),
  S("quinoa-cooked", "carb", "cup", 185, ALL, { default: true }),
  S("oatmeal-cooked", "carb", "cup", 234, ALL, { mayContain: ["gluten", "wheat"], default: true }),
  S("potato-baked-with-skin", "carb", "whole", 173, ALL, { default: true }),
  S("sweet-potato-baked", "carb", "whole", 114, ALL, { default: true }),
  S("banana", "carb", "whole", 118, ALL, { default: true }),
  S("apple-with-skin", "carb", "whole", 182, ALL, { allergens: ["apple"], categories: ["apple"] }),
  S("white-bread", "carb", "whole", 29, ALL, { allergens: ["wheat", "gluten"], mayContain: ["soy", "dairy"], categories: ["gluten"] }),
  S("corn-tortilla", "carb", "whole", 26, ALL),
  S("whole-wheat-bread", "carb", "whole", 32, ALL, { allergens: ["wheat", "gluten"], mayContain: ["soy", "dairy"], categories: ["gluten"] }),
  S("blueberries", "carb", "cup", 148, ALL, { default: true }),
  // Vegetables (role carb, as the layout counts them): a main plate takes one whenever Eats has it.
  S("broccoli-cooked", "carb", "cup", 156, ALL, { default: true }),
  S("green-beans-cooked", "carb", "cup", 125, ALL, { default: true }),
  S("spinach-cooked", "carb", "cup", 180, ALL),
  S("olive-oil", "fat", "tbsp", 13.5, ALL, { default: true }),
  S("avocado-oil", "fat", "tbsp", 13.5, ALL, { default: true }),
  S("avocado", "fat", "cup", 150, ALL, { default: true }),
  S("peanut-butter", "fat", "tbsp", 16, ALL, { allergens: ["peanut"], mayContain: ["tree-nut"], default: true }),
  S("almonds", "fat", "oz", 28.35, ALL, { allergens: ["tree-nut"], mayContain: ["peanut"], default: true }),
  S("pumpkin-seeds", "fat", "oz", 28.35, ALL, { mayContain: ["tree-nut", "peanut"], default: true }),
  S("butter", "fat", "tbsp", 14.2, ANIMAL, { allergens: ["dairy"] }),
];

export function starterForName(name: string): Starter | undefined {
  return STARTERS.find((item) => dbFood(item.id)?.name.toLowerCase() === name.toLowerCase());
}

/** Curated household weight when the generic unit table lacks this starter's portion. */
export function starterPortionGrams(name: string, unit: FoodUnit): number | null {
  const item = starterForName(name);
  return item?.unit === unit ? item.grams : null;
}

export function dietStyle(flags: readonly string[]): DietStyle {
  if (flags.includes("vegan")) return "vegan";
  if (flags.includes("vegetarian")) return "vegetarian";
  if (flags.includes("pescatarian")) return "pescatarian";
  return "omnivore";
}

/** Why one starter is withheld: the rule in the user's words, and whether the starter breaks it or just cannot be checked against it. */
export type StarterRuleHit = { rule: string; verdict: "violates" | "unverified" };

const NO_FLAGS: readonly string[] = [];
const FOOD_RULES = "food rules";

/** Flags the evaluator reads as preference flags (the 12 legacy ones; anything else is ignored). */
function preferenceFlagsFor(flags: readonly string[]): LegacyPreferenceFlag[] {
  return LEGACY_PREFERENCE_FLAGS.filter((flag) => flags.includes(flag));
}

/**
 * The inputs `evaluatePolicy` reads for an account, built the way lib/server/policy-profile.ts
 * builds them: the legacy flags are preference flags, and the instances are the profile's hard
 * rules. A flag's own synthesized instance (and the stored row a flag already covers) is never
 * added a second time as a profile rule, exactly as the server never adds one: the flag is the
 * person's current choice and reaches the evaluator as a preference flag. `legacy_no_pork` and
 * `legacy_no_beef` exist only as a synthesis of those flags, so they fold back into the flags.
 */
export function starterPolicyInputs(
  flags: readonly string[], profile: Profile, instances: readonly ProfileInstance[], asOf: Date,
): { profile: ConstraintProfile; preferenceFlags: LegacyPreferenceFlag[] } {
  const preferenceFlags = new Set(preferenceFlagsFor(flags));
  for (const instance of instances) {
    if (instance.profileId === "legacy_no_pork") preferenceFlags.add("no_pork");
    else if (instance.profileId === "legacy_no_beef") preferenceFlags.add("no_beef");
  }
  const flagBacked = legacyProfileIdsFor(LEGACY_PREFERENCE_FLAGS.filter((flag) => preferenceFlags.has(flag)));
  const rules = instances.filter((instance) => !flagBacked.has(instance.profileId)
    && instance.profileId !== "legacy_no_pork" && instance.profileId !== "legacy_no_beef");
  return {
    preferenceFlags: LEGACY_PREFERENCE_FLAGS.filter((flag) => preferenceFlags.has(flag)),
    profile: {
      avoid_allergens: profile.avoid_allergens, avoid_food_ref_ids: profile.avoid_food_ref_ids,
      banned_categories: profile.banned_categories, conditions: profile.conditions,
      ...(profile.custom_rules === undefined ? {} : { custom_rules: profile.custom_rules }),
      profileIds: instances.map((instance) => instance.profileId),
      profileRules: activeHardRulesFor(rules, asOf),
    },
  };
}

/**
 * The one eligibility verdict for a starter: the fail-closed verdict Today, Coach and the plan
 * checks use (`suggestionItemsVerdict` → `evaluatePolicy`), judged on the starter's own bundled
 * row. Anything that verdict does not call "allowed" (blocked, unverified, unknown) is withheld.
 * Curated starter data (`starterSuggestionEvidence`) can only add denying evidence here.
 */
function starterRuleHit(
  item: Starter, flags: readonly string[], profile: Profile, instances: readonly ProfileInstance[],
  asOf: Date,
): StarterRuleHit | null {
  const food = dbFood(item.id);
  if (food === undefined) return { rule: "the bundled food list", verdict: "unverified" };
  // A starter has no food-ref id to compare with `avoid_food_ref_ids`, so a profile that names any
  // avoided food cannot be checked here: every starter is withheld (fail closed), never offered.
  if (profile.avoid_food_ref_ids.length > 0) return { rule: "Avoid list", verdict: "unverified" };
  const { profile: constraint, preferenceFlags } = starterPolicyInputs(flags, profile, instances, asOf);
  const refId = `starter:${item.id}`;
  const facts = starterSuggestionEvidence(item, {
    allergenTags: [], allergenEvidence: {}, checkedAllergens: [], ingredientsText: null,
    ingredientsTextIsLabel: false, foodName: food.name, foodBrand: null, packaged: false,
    policyCategories: null, facets: {}, noCook: null, onEatsList: false, onAvoidList: false,
    role: item.role,
  });
  const verdict = suggestionItemsVerdict(
    [{ foodRefId: refId, catalogFoodRevisionId: null, verdict: "allowed" }],
    { status: "ready", preferenceFlags, byIdentity: { [suggestionFoodIdentity({ foodRefId: refId, catalogFoodRevisionId: null })]: facts } },
    constraint, false);
  if (verdict.outcome === "allowed") return null;
  return { rule: FOOD_RULES, verdict: verdict.outcome === "blocked" ? "violates" : "unverified" };
}

/**
 * Every starter with the rule that withholds it (null: it is offered). Diet style is judged
 * separately (it can only deny), so a starter of another diet carries `{ rule: "diet", verdict:
 * "violates" }`.
 */
export function starterRuleHits(flags: readonly string[], profile: Profile,
  instances: readonly ProfileInstance[] = [], asOf: Date = new Date(),
): Map<string, StarterRuleHit | null> {
  const style = dietStyle(flags);
  return new Map(STARTERS.map((item) => [item.id, item.diets.includes(style)
    ? starterRuleHit(item, flags, profile, instances, asOf)
    : { rule: "diet", verdict: "violates" as const }]));
}

/**
 * Absence of a loaded profile must never mean that allergens are clear. A starter whose status
 * cannot be proved is withheld by itself; the list is never emptied wholesale because one facet
 * cannot be checked.
 */
export function starterChoices(flags: readonly string[], profile: Profile,
  instances: readonly ProfileInstance[] = [], asOf: Date = new Date()): Starter[] {
  const hits = starterRuleHits(flags, profile, instances, asOf);
  return STARTERS.filter((item) => hits.get(item.id) === null);
}

/**
 * The same eligibility verdict `starterChoices` applies, against the account's CURRENT stored
 * profile only (no draft flags) — for a just-before-write recheck where only the stored
 * profile+instances could have changed. True when the item is now excluded and must not be
 * written as "eats".
 */
export function starterExcludedByCurrentRules(
  item: Starter, profile: Profile, instances: readonly ProfileInstance[], asOf: Date = new Date(),
  flags: readonly string[] = NO_FLAGS,
): boolean {
  return starterExclusionReason(item, profile, instances, asOf, flags) !== null;
}

/** The rule that now withholds one starter from the CURRENT profile, or null when it is still allowed. */
export function starterExclusionReason(
  item: Starter, profile: Profile, instances: readonly ProfileInstance[], asOf: Date = new Date(),
  flags: readonly string[] = NO_FLAGS,
): StarterRuleHit | null {
  return starterRuleHit(item, flags, profile, instances, asOf);
}

export function starterDefaultIds(choices: readonly Starter[]): string[] {
  return choices.filter((item) => item.default).map((item) => item.id);
}

export type StarterMark = "eats" | "avoid" | "neutral";
export type InitialStarterOptions = {
  /**
   * true (the legacy grid's default): every curated default starts marked "eats", and the user
   * reviews the whole visible grid before saving. false: nothing is pre-marked; only the user's
   * own taps, foods named in their text and their saved foods start marked. A surface that does
   * not show every pre-marked food (onboarding v2's falling pile) must pass false, or every
   * default it never showed is saved as a liked food (2026-10-07 QA: 29 Eats nobody chose).
   */
  preselectDefaults?: boolean;
};

export function initialStarterSelection(
  flags: readonly string[], profile: Profile, prefsText: string,
  instances: readonly ProfileInstance[] = [], existingFoods: readonly Food[] = [],
  options: InitialStarterOptions = {},
): Record<string, StarterMark> {
  const choices = starterChoices(flags, profile, instances);
  const preselect = options.preselectDefaults ?? true;
  const marks: Record<string, StarterMark> = preselect ? Object.fromEntries(
    starterDefaultIds(choices).map((id) => [id, "eats"])) : {};
  const allowed = new Set(choices.map((item) => item.id));
  for (const [id, status] of mentionedFoodChoices(prefsText, STARTERS)) {
    if (status === "avoid" || allowed.has(id)) marks[id] = status;
  }
  // Reopening setup must not replace explicit account choices with starter suggestions.
  for (const food of [...existingFoods].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const item = starterForName(food.name);
    if (!item) continue;
    // Withhold ineligible suggestions without silently changing the saved membership.
    if (food.status === "eats" && !allowed.has(item.id)) delete marks[item.id];
    else marks[item.id] = food.status;
  }
  return marks;
}

/**
 * "Pick for me" without overriding the user: the ids to add so that every role reaches the
 * two-per-role floor `starterSelectionValid` asks for, or the higher count `need` names for a role
 * (a legacy plan needs one distinct protein per planned meal; a number applies to every role).
 * Roles already at their count get nothing; a food the user liked or avoided is never re-marked,
 * and neither is any id in `skip` — the foods the person tapped off in this flow (GPT-6 Sol WARN
 * onb2-p0). A `neutral` mark alone stays available: a saved food the account left neutral (a
 * re-opened setup) is not a tap-off. Curated defaults come first in catalog order, then any other
 * allowed food of that role. Returns [] when every role is already covered, and fewer than asked
 * when the allowed foods run out (the caller checks the result). Pure.
 */
export function starterFillShortRoles(
  choices: readonly Starter[], marks: Readonly<Record<string, StarterMark>>,
  need: number | Partial<Record<FoodRole, number>> = 2,
  skip: ReadonlySet<string> = new Set(),
  /** Reorders a role's open foods (defaults first, then catalog order) before the fill takes the
   *  first ones; onboarding v2 passes `starterFillOrder` (lib/foods/starter-variety.ts) so the
   *  picks cover plate parts, not two starches. Absent: that default order. */
  order?: (open: Starter[], choices: readonly Starter[], marks: Readonly<Record<string, StarterMark>>) => Starter[],
): string[] {
  const added: string[] = [];
  for (const role of ["protein", "carb", "fat"] as const) {
    const target = Math.max(2, typeof need === "number" ? need : need[role] ?? 2);
    const ofRole = choices.filter((item) => item.role === role);
    const have = ofRole.filter((item) => marks[item.id] === "eats").length;
    const open = ofRole.filter((item) => !skip.has(item.id)
      && (marks[item.id] === undefined || marks[item.id] === "neutral"));
    const byDefault = [...open.filter((item) => item.default), ...open.filter((item) => !item.default)];
    const ordered = order ? order(byDefault, choices, marks) : byDefault;
    added.push(...ordered.slice(0, Math.max(0, target - have)).map((item) => item.id));
  }
  return added;
}

/** How many foods one role needs: two, or every food it has when the account's rules leave fewer. */
export function starterRoleRequirement(role: FoodRole, choices: readonly Starter[]): number {
  return Math.min(2, choices.filter((item) => item.role === role).length);
}

/** The roles whose rules leave fewer than two foods (zero: the role is skipped). */
export function starterShortRoles(choices: readonly Starter[]): FoodRole[] {
  return (["protein", "carb", "fat"] as const).filter((role) =>
    choices.filter((item) => item.role === role).length < 2);
}

/**
 * Two foods per role, or every food a role has when the account's rules leave fewer (a role with
 * none is skipped) — a person with hard food rules must always be able to finish (W062).
 */
export function starterSelectionValid(ids: readonly string[], choices: readonly Starter[]): boolean {
  const selected = new Set(ids);
  return (["protein", "carb", "fat"] as const).every((role) =>
    choices.filter((item) => item.role === role && selected.has(item.id)).length
      >= starterRoleRequirement(role, choices));
}

export type StarterSelectionProblem =
  | { kind: "rule"; foodName: string; rule: string; verdict: StarterRuleHit["verdict"] }
  | { kind: "floor"; role: FoodRole; need: number; have: number };

const ROLE_WORDS: Record<FoodRole, string> = { protein: "proteins", carb: "carbs", fat: "fats" };

/**
 * What stops a picked selection from saving against the account's rules: a picked food a rule now
 * withholds (named, with the rule), else a role still short of its floor. Null when it saves. Pure.
 */
export function starterSelectionProblem(
  ids: readonly string[], flags: readonly string[], profile: Profile,
  instances: readonly ProfileInstance[] = [], asOf: Date = new Date(),
): StarterSelectionProblem | null {
  const hits = starterRuleHits(flags, profile, instances, asOf);
  const choices = STARTERS.filter((item) => hits.get(item.id) === null);
  if (starterSelectionValid(ids, choices)) return null;
  for (const id of ids) {
    const hit = hits.get(id);
    const name = dbFood(id)?.name;
    if (hit && name && hit.rule !== "diet") return { kind: "rule", foodName: name, rule: hit.rule, verdict: hit.verdict };
  }
  const selected = new Set(ids);
  for (const role of ["protein", "carb", "fat"] as const) {
    const need = starterRoleRequirement(role, choices);
    const have = choices.filter((item) => item.role === role && selected.has(item.id)).length;
    if (have < need) return { kind: "floor", role, need, have };
  }
  return null;
}

/** The line the person reads for a selection problem. */
export function starterProblemMessage(problem: StarterSelectionProblem): string {
  if (problem.kind === "floor") {
    return `Pick ${problem.need} ${ROLE_WORDS[problem.role]} in Foods to finish.`;
  }
  return problem.verdict === "violates"
    ? `${problem.foodName} doesn't fit your ${problem.rule}. Go back to Foods, take it off, and pick again.`
    : `We can't confirm ${problem.foodName} fits your ${problem.rule}. Go back to Foods, take it off, and pick again.`;
}

export function starterFood(id: string, status: FoodStatus): Food {
  const item = STARTERS.find((candidate) => candidate.id === id);
  const db = dbFood(id);
  if (!item || !db) throw new Error(`Unknown starter food: ${id}`);
  const factor = item.grams / 100;
  return { id: `starter:${id}`, name: db.name, role: item.role, unit: item.unit,
    perUnit: { protein: db.per100g.protein * factor, carbs: db.per100g.carbs * factor, fat: db.per100g.fat * factor },
    status, updatedAt: new Date(0).toISOString() };
}

/** Only explicit sentiment near a food name changes its suggested selection. */
export function mentionedFoodChoices(text: string, choices: readonly Starter[]): Map<string, "eats" | "avoid"> {
  const found = new Map<string, "eats" | "avoid">();
  const clauses = text.toLowerCase().split(/[,.;]|\band\b/);
  for (const item of choices) {
    const name = dbFood(item.id)?.name.toLowerCase();
    if (!name) continue;
    const aliases = [name, name.split(",")[0], item.id.replace(/-(cooked|roasted|with-skin)$/, "").replaceAll("-", " ")];
    for (const clause of clauses) {
      for (const alias of aliases) {
        if (alias.length < 4 || !clause.includes(alias)) continue;
        const at = clause.indexOf(alias);
        const before = clause.slice(Math.max(0, at - 40), at);
        const after = clause.slice(at + alias.length, at + alias.length + 28);
        const avoid = /\b(don'?t|do not)\s+(?:eat|like)\s+(?:\w+\s+){0,2}$/.test(before)
          || /\b(allergic to|avoid|hate)\s+(?:\w+\s+){0,2}$/.test(before)
          || /\bno\s+(?:\w+\s+)?$/.test(before)
          || /^\s+(?:\w+\s+){0,2}(?:hate|avoid)\b/.test(after);
        const eat = /\b(love|like|more|eat)\s+(?:\w+\s+){0,2}$/.test(before)
          || /^\s+(?:\w+\s+){0,2}(?:love|like)\b/.test(after);
        if (avoid) found.set(item.id, "avoid");
        else if (eat && found.get(item.id) !== "avoid") found.set(item.id, "eats");
        break;
      }
    }
  }
  return found;
}
