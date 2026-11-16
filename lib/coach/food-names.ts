/** Display spellings derived only from a completed catalog label, never from a model alias. */
export function catalogFoodNames(name: string): string[] {
  const [head, ...qualifiers] = name.split(",").map((part) => part.trim()).filter(Boolean);
  if (!head) return [];
  const protectedQualifier = /(?:-free\b|\b(?:without|imitation|plant-based|substitute|non-dairy|vegan)\b)/i
    .test(qualifiers.join(" "));
  const taxonomy = /^(?:nuts|seeds|snacks|beverages|fish|crustaceans|mollusks|fast foods|restaurant|candies|cereals(?: ready-to-eat)?|soups|sauce|salad dressing|alcoholic beverage)$/i;
  const names = [name];
  if (!protectedQualifier && !(qualifiers.length && taxonomy.test(head))) names.push(head);
  if (qualifiers.length) {
    names.push(`${[...qualifiers].reverse().join(" ")} ${head}`);
    if (!protectedQualifier) names.push(`${qualifiers[0]} ${head}`);
  }
  // The catalog qualifies plain cuts. A dish (chicken salad, soy chicken, breaded chicken)
  // never becomes this generic noun; its other ingredients must keep their own identity.
  if (!protectedQualifier && /^chicken (?:breast|thigh|drumstick|wing)(?: meat)?$/i.test(head)) {
    names.push("chicken");
    if (qualifiers.length) names.push(`${qualifiers.join(" ")} chicken`);
  }
  return [...new Set(names)];
}

export const foodNameKey = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}%' -]/gu, " ").replace(/\s+/g, " ").trim();

function spellings(name: string): string[] {
  const forms = [name, `${name}s`, `${name}es`];
  if (name.endsWith("ies")) forms.push(`${name.slice(0, -3)}y`);
  if (name.endsWith("es")) forms.push(name.slice(0, -2));
  if (name.endsWith("s")) forms.push(name.slice(0, -1));
  if (name.endsWith("y")) forms.push(`${name.slice(0, -1)}ies`);
  return forms;
}

/** The same spelling boundary for held evidence, cards, prose, and the streamed draft. */
export function catalogNameMatches(catalogName: string, phrase: string): boolean {
  const forms = new Set(spellings(foodNameKey(phrase)));
  return catalogFoodNames(catalogName).some((alias) => forms.has(foodNameKey(alias)));
}
