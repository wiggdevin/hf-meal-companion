import type { ComposedMeal } from "@/lib/coach/compose";

const sentence = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

/** Factual server notes only; this helper introduces no food identity or target-fit claim. */
export function ideaReviewCopy(meals: readonly ComposedMeal[], options: {
  notices?: readonly string[]; messages?: readonly string[];
} = {}): string {
  const lines = [...(options.notices ?? []),
    meals.length === 1 ? "Here is 1 option to review." : `Here are ${meals.length} options to review.`,
    ...meals.flatMap((meal) => !meal.fitsTarget && meal.fitNote ? [meal.fitNote] : []),
    ...meals.flatMap((meal) => meal.shortfallNote ? [meal.shortfallNote] : []),
    ...(options.messages ?? []),
    ...(meals.some((meal) => meal.leftOut?.length) ? ["The card shows what was left out."] : []),
  ].filter((line) => line.trim());
  return [...new Set(lines.map(sentence))].join(" ");
}
