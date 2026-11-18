/**
 * Onboarding v2 — the one chip surface every chip and stepper in the conversational shell shares.
 *
 * Live QA 2026-10-07 (defect 1): this used to be `.well`'s light fog fill
 * (`bg-[var(--color-fog)]`) with `text-charcoal`. The shell carries `.matte`, which turns
 * `text-charcoal` cream but leaves `--color-fog` light, so every chip read cream on cream (about
 * 1.1:1). The recipe is now the dock's own chip surface (`dock/OnboardingDock.module.css`
 * `.chipSurface`): a faint tint and a hairline drawn from `--ink-rgb`, which `.matte` remaps to
 * cream and the light ground keeps as ink — so the same chip reads correctly on either scope.
 * `tests/design/contrast-scan.test.ts` rule 6 now fails a light fill under a `.matte` ancestor in
 * another file, which is how this slipped past the scan before.
 *
 * Porcelain (2026-11-18): the shell now stands on the light porcelain ground with no `.matte`
 * scope, so the chip is a white tile (`--color-surface`) with an ink hairline, like every other
 * Porcelain card.
 *
 * Every caller supplies its own `rounded-*` and its own min-height (≥ 44 px, DESIGN.md).
 */
export const CHIP_FILL = "bg-surface shadow-[0_0_0_1px_rgb(var(--ink-rgb)/0.16)]";

/** The picked chip: the ink primary fill with white text. A separate class set from `CHIP_FILL`
 *  (callers pick one or the other), so a white resting tile and the on-primary text never share
 *  one element's classes. */
export const CHIP_PICKED = "[background:var(--grad-ink)] text-on-primary shadow-[0_0_0_1px_rgb(var(--ink-rgb)/0.55)]";
