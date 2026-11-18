const normalized = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().trim().replace(/\s+/g, " ").replace(/^(?:a|an|the) /, "");

/** A whole-message membership review, bound to the subject the person actually named. */
export function catalogReviewIntent(message: string, query?: string): "eats" | "avoid" | null {
  const match = /^\s*(?:please\s+)?(?:show|find|search|browse|look up)\s+(?:me\s+)?(.+?)(?:\s+in the catalog)?\s+so i can decide (?:whether|if) to (avoid|favou?r) it[.!?]?\s*$/i.exec(message);
  if (!match || /[,;.!?]|\b(?:and|or|then|not|no|don't|do not|log|save|add|remove)\b/i.test(match[1])) return null;
  const subject = normalized(match[1]);
  if (!subject || (query !== undefined && normalized(query) !== subject)) return null;
  return match[2].toLowerCase() === "avoid" ? "avoid" : "eats";
}
