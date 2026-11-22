/** Curated, account-filtered starters from the bundled USDA food list. */
import { starterFacetOutcome } from "./starter-evidence";
import { dbFood } from "@/lib/food-db";
import type { Profile } from "@/lib/constraints-client";
import type { Food, FoodRole, FoodStatus, FoodUnit } from "@/lib/foods";
import { profileFacetOutcome } from "@/lib/policy/profiles/hard-rules";
import { isActiveHardRule, type ProfileInstance } from "@/lib/policy/profiles/types";
import { allergenKey } from "@/lib/policy/allergens";
import { profileDefinition } from "@/lib/policy/profiles/catalog";
import {
  LEGACY_PREFERENCE_FLAGS, profileInstancesForLegacyFlags, type LegacyPreferenceFlag,
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

/**
 * One concern per allergen for a starter: wheat and gluten are the same concern here (W014, audit
 * 2026-10-10 A041), so an account that avoids either never sees a starter tagged with the other.
 */
function allergenConcern(name: string): string {
  const key = allergenKey(name);
  return key === "wheat" ? "gluten" : key;
}

/** Why one starter is withheld: the rule in the user's words, and whether the starter breaks it or just cannot be checked against it. */
export type StarterRuleHit = { rule: string; verdict: "violates" | "unverified" };

function profileRuleName(profileId: string): string {
  const label = profileDefinition(profileId)?.label
    ?? profileId.replace(/^legacy_/, "").replaceAll("_", " ");
  return `${label.charAt(0).toLowerCase()}${label.slice(1)} rule`;
}

/**
 * The first rule one starter breaks, or null when it passes every rule set. A hard-rule facet that
 * neither the starter's curated evidence nor the generic policy evidence can clear is "unverified":
 * that one starter is withheld, never the whole list (W062).
 */
function starterRuleHit(
  item: Starter, bannedCategories: ReadonlySet<string>, avoidAllergens: ReadonlySet<string>,
  instances: readonly ProfileInstance[], asOf: Date, avoidedIds: ReadonlySet<string> = NO_IDS,
): StarterRuleHit | null {
  if (dbFood(item.id) === undefined) return { rule: "the bundled food list", verdict: "unverified" };
  if (avoidedIds.has(item.id)) return { rule: "Avoid list", verdict: "violates" };
  const category = (item.categories ?? []).find((key) => bannedCategories.has(key));
  if (category) return { rule: `no-${category} rule`, verdict: "violates" };
  const allergen = [...(item.allergens ?? []), ...(item.mayContain ?? [])]
    .find((key) => avoidAllergens.has(allergenConcern(key)));
  if (allergen) return { rule: `${allergen.replace("-", " ")} allergy`, verdict: "violates" };
  const name = dbFood(item.id)?.name;
  for (const instance of instances) {
    for (const rule of instance.rules) {
      if (!isActiveHardRule(rule, asOf)) continue;
      const outcome = starterFacetOutcome(item, rule.facet) ?? profileFacetOutcome(rule.facet, {
        // The bundled name may name a facet, but it is not a label and clears nothing here: only
        // the starter's own curated evidence (starterFacetOutcome) can (Phase 18 W2c).
        foodName: name, wholeFoodName: null, ingredientsText: name, ingredientsTextIsLabel: false,
      });
      if (outcome !== "absent") {
        return { rule: profileRuleName(instance.profileId),
          verdict: outcome === "present" ? "violates" : "unverified" };
      }
    }
  }
  return null;
}

const NO_IDS: ReadonlySet<string> = new Set();

/** The legacy-flag instances `starterChoices` judges with, so a preview and a later save read the same rules. */
function flagInstances(flags: readonly string[], asOf: Date): ProfileInstance[] {
  const known = flags.filter((flag): flag is LegacyPreferenceFlag =>
    (LEGACY_PREFERENCE_FLAGS as readonly string[]).includes(flag));
  return profileInstancesForLegacyFlags(known, asOf.toISOString());
}

function flagBans(flags: readonly string[], profile: Profile): { banned: Set<string>; allergens: Set<string> } {
  const banned = new Set(profile.banned_categories.map((x) => x.toLowerCase()));
  const allergens = new Set(profile.avoid_allergens.map(allergenConcern));
  for (const flag of flags) {
    const key = ({ no_shellfish: "shellfish", no_eggs: "egg", no_soy: "soy", no_peanuts: "peanut" } as Record<string, string>)[flag];
    if (key) allergens.add(allergenConcern(key));
  }
  if (flags.includes("low_fodmap")) banned.add("beans");
  if (flags.includes("no_pork") || flags.includes("halal") || flags.includes("kosher")) banned.add("pork");
  if (flags.includes("no_beef")) banned.add("beef");
  // No certification data exists for meat; halal/kosher suggestions use plant, eggs and fish only.
  if (flags.includes("halal") || flags.includes("kosher")) { banned.add("beef"); banned.add("poultry"); }
  return { banned, allergens };
}

/**
 * Every starter with the rule that withholds it (null: it is offered). Diet style is judged
 * separately, so a starter of another diet carries `{ rule: "diet", verdict: "violates" }`.
 * `avoidedIds` are the starters an `avoid_food_ref_ids` entry resolves to (see
 * `avoidedStarterIds`); an id that names no starter excludes nothing.
 */
export function starterRuleHits(flags: readonly string[], profile: Profile,
  instances: readonly ProfileInstance[] = [], asOf: Date = new Date(),
  avoidedIds: ReadonlySet<string> = NO_IDS): Map<string, StarterRuleHit | null> {
  const style = dietStyle(flags);
  const { banned, allergens } = flagBans(flags, profile);
  const all = [...instances, ...flagInstances(flags, asOf)];
  return new Map(STARTERS.map((item) => [item.id, item.diets.includes(style)
    ? starterRuleHit(item, banned, allergens, all, asOf, avoidedIds)
    : { rule: "diet", verdict: "violates" as const }]));
}

/**
 * Absence of a loaded profile must never mean that allergens are clear. A starter whose status
 * cannot be proved is withheld by itself; the list is never emptied wholesale because one facet
 * is uncurated. An `avoid_food_ref_ids` entry removes only the starter it resolves to.
 */
export function starterChoices(flags: readonly string[], profile: Profile,
  instances: readonly ProfileInstance[] = [], asOf: Date = new Date(),
  avoidedIds: ReadonlySet<string> = NO_IDS): Starter[] {
  const hits = starterRuleHits(flags, profile, instances, asOf, avoidedIds);
  return STARTERS.filter((item) => hits.get(item.id) === null);
}

/**
 * The same allergen/category/hard-rule check `starterChoices` applies, but against the account's
 * CURRENT profile directly (no diet-style filter, no flag-derived bans merged in) — for a
 * just-before-write recheck where only the stored profile+instances could have changed, not the
 * draft's own flags. Returns true when the item is now excluded and must not be written as "eats".
 */
export function starterExcludedByCurrentRules(
  item: Starter, profile: Profile, instances: readonly ProfileInstance[], asOf: Date = new Date(),
  avoidedIds: ReadonlySet<string> = NO_IDS,
): boolean {
  return starterExclusionReason(item, profile, instances, asOf, avoidedIds) !== null;
}

/** The rule that now withholds one starter from the CURRENT profile, or null when it is still allowed. */
export function starterExclusionReason(
  item: Starter, profile: Profile, instances: readonly ProfileInstance[], asOf: Date = new Date(),
  avoidedIds: ReadonlySet<string> = NO_IDS,
): StarterRuleHit | null {
  const banned = new Set(profile.banned_categories.map((x) => x.toLowerCase()));
  const allergens = new Set(profile.avoid_allergens.map(allergenConcern));
  return starterRuleHit(item, banned, allergens, instances, asOf, avoidedIds);
}

/**
 * The starters an `avoid_food_ref_ids` entry names, read from this device's food-ref cache
 * (`readPrefRefCache`: starter foods are cached under `starter:<id>`). A ref id the cache cannot
 * place names no starter here; the server still applies it to every food it matches.
 */
export function avoidedStarterIds(
  profile: Pick<Profile, "avoid_food_ref_ids">,
  refs: Readonly<Record<string, { userRefId?: string; catalogRefId?: string } | undefined>>,
): Set<string> {
  const avoid = new Set(profile.avoid_food_ref_ids);
  const ids = new Set<string>();
  if (avoid.size === 0) return ids;
  for (const item of STARTERS) {
    const ref = refs[`starter:${item.id}`];
    if (ref && ((ref.userRefId && avoid.has(ref.userRefId)) || (ref.catalogRefId && avoid.has(ref.catalogRefId)))) {
      ids.add(item.id);
    }
  }
  return ids;
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
  /** Starters an `avoid_food_ref_ids` entry resolves to (see `avoidedStarterIds`). */
  avoidedIds?: ReadonlySet<string>;
};

export function initialStarterSelection(
  flags: readonly string[], profile: Profile, prefsText: string,
  instances: readonly ProfileInstance[] = [], existingFoods: readonly Food[] = [],
  options: InitialStarterOptions = {},
): Record<string, StarterMark> {
  const choices = starterChoices(flags, profile, instances, new Date(), options.avoidedIds);
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
  avoidedIds: ReadonlySet<string> = NO_IDS,
): StarterSelectionProblem | null {
  const hits = starterRuleHits(flags, profile, instances, asOf, avoidedIds);
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
