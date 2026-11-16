import type { CoachAction } from "@/lib/coach/actions";
import type { EvidenceByName } from "@/lib/coach/policy";
import { catalogNameMatches } from "@/lib/coach/food-names";
import { projectLogText, type LoggedConfirmationItem } from "@/lib/coach/log-confirmation";

/** Retention only: inputs are the turn's actual post-policy actions, never raw model actions. */
export function retainRequestedLogs(request: string, actions: readonly CoachAction[],
  items: readonly LoggedConfirmationItem[], evidence: EvidenceByName): CoachAction[] {
  const match = /^(?:please\s+)?(?:log|i\s+(?:just\s+)?(?:ate|had))\s+(.+?)[.!]?$/i.exec(request.trim());
  if (!match || /[?!;\n"“”]|\b(?:if|unless|would|could|will|might|not|never|don't|then|because|but|also|instead)\b/i.test(request)) return [];
  const body = match[1].replace(/[.!]$/, "").trim();
  const known = items.filter((item) => item.foodRefId && Number.isFinite(item.grams) && item.grams > 0
    && Object.entries(evidence).some(([name, entry]) => !entry.ambiguous
      && entry.foodRefId === item.foodRefId && catalogNameMatches(name, item.name)));
  const quantified = /^\d+(?:\.\d+)?\s*(?:g|grams?)\b/i.test(body);
  const authorized = quantified ? projectLogText(`Logged ${body}.`, known, evidence).confirmed
    : known.filter((item) => projectLogText(
      `Logged ${item.grams} g ${body.replace(/^(?:a|an|some)\s+/i, "")}.`, [item], evidence).confirmed.length === 1);
  return actions.filter((action) => action.kind === "log_meal" && action.items.length > 0
    && action.items.every((item) => authorized.some((held) => held.foodRefId === item.foodRefId
      && held.name === item.name && held.grams === item.grams && held.slot === action.slot && held.at === action.at)));
}
