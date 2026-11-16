/** Shared literal effort phrases for recipe discovery and checked meal admission. */
export const NO_COOK_PATTERN = String.raw`\b(?:(?:with\s+)?no[- ]cook(?:ing)?|without\s+(?:any\s+|needing\s+to\s+|having\s+to\s+)?cook(?:ing)?|ready[- ]to[- ]eat)\b`;
export function asksForNoCook(wish: string | undefined): boolean {
  return new RegExp(NO_COOK_PATTERN, "i").test(wish ?? "");
}
