import { isCoachCommand } from "@/lib/profile/coach-commands";
import type { ComposedMeal } from "@/lib/coach/compose";
import type { UiBlock } from "@/lib/coach/ui-blocks";
import { ideaReviewCopy } from "@/lib/coach/idea-review-copy";

/** Pure suggestion commands already answered by checked cards need no generative summary. */
export function completedIdeasReply(message: string, calls: readonly { name: string; ok: boolean; result?: unknown }[],
  meals: readonly ComposedMeal[], blocks: readonly UiBlock[], suggestMessage?: string | null): string | null {
  const text = message.toLowerCase().trim();
  const visible = blocks.flatMap((block) => block.kind === "food_ideas" ? block.ideas : []);
  const result = calls[0]?.result as { notice?: unknown; message?: unknown; refusals?: unknown[] } | undefined;
  if (!isCoachCommand(text) || !/^(?:make me|give me|suggest|show me|find|a |an |some |what should i (?:eat|have))\b/.test(text)
      || /\b(?:log|logged|ate|eaten|track|save|add|remove|avoid|change|set|move|explain|why)\b/.test(text)
      || calls.length !== 1 || !calls[0].ok
      || !["suggest_options", "compose_meal"].includes(calls[0].name)
      || /\bchart\b|^(?:show|give|find) me (?:my|today.s) (?:macros|plan|targets|totals|calories)\b/.test(text)
      || result?.refusals?.length || meals.length === 0 || visible.length !== meals.length
      || meals.some((meal) => meal.incomplete || meal.refusals?.length || meal.flagged.length > 0
        || meal.items.length === 0 || meal.items.every((item) => item.grams === 0)
        || meal.items.some((item) => !item.foodRefId || item.verdict !== "allowed"))) return null;
  const notices = typeof result?.notice === "string" && result.notice.trim() ? [result.notice] : [];
  const messages = [suggestMessage, result?.message]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  const caveated = notices.length || messages.length
    || meals.some((meal) => !meal.fitsTarget || meal.shortfallNote || meal.leftOut?.length);
  return caveated ? ideaReviewCopy(meals, { notices, messages })
    : `Here are ${meals.length} meal ideas. The cards show portions and target fit.`;
}
