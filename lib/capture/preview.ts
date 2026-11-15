import { snapshotFor } from "@/lib/log-client";
import { MACRO_CODES } from "@/lib/nutrients/codes";
import { itemKcal } from "@/lib/nutrients/energy";
import { round4 } from "@/lib/nutrients/snapshot";
import type { EditedItem } from "@/lib/capture-client";
import type { ProposeResponse } from "@/lib/capture/types";
import type { CachedRevision } from "@/lib/db/catalog-cache";
import type { Macros } from "@/lib/types";

type RevisionDraft = {
  proposal: Pick<ProposeResponse, "items">;
  revisions?: Record<number, CachedRevision>;
  alternativeRevisions?: Record<string, CachedRevision>;
};

/** A chosen match previews only with the revision that belongs to that exact match. */
export function selectedRevision(item: EditedItem, draft: RevisionDraft): CachedRevision | undefined {
  const original = draft.proposal.items.find((row) => row.seq === item.seq);
  const revision = item.foodRefId === original?.foodRefId ? draft.revisions?.[item.seq]
    : item.foodRefId ? draft.alternativeRevisions?.[item.foodRefId] : undefined;
  return revision?.revision_id === item.catalogFoodRevisionId ? revision : undefined;
}

/** The label's own numbers as a revision, for the item saved as their food (W017 A030). */
function labelRevision(per100g: Record<string, number | null>): CachedRevision {
  return { per_100g: per100g, source: "label", version_label: "label", revision_id: 0 } as unknown as
    CachedRevision;
}

/**
 * `label`: the item saved as their own food previews the label's nutrition, which is what the
 * server will store for it, never the catalog match it was grounded to.
 */
export function projectedCaptureMacros(
  items: readonly EditedItem[], draft: RevisionDraft,
  label?: { seq: number | null; per100g?: Record<string, number | null> },
): Macros | null {
  const total = items.reduce<Macros | null>((total, item) => {
    const own = label?.per100g && item.seq === label.seq ? labelRevision(label.per100g) : undefined;
    const revision = own ?? selectedRevision(item, draft);
    if (!total || !revision || (item.foodRefId === null && !own)) return null;
    const snapshot = snapshotFor(revision, item.grams);
    return {
      kcal: round4(total.kcal + (itemKcal(snapshot) ?? 0)),
      protein: round4(total.protein + (snapshot[MACRO_CODES.protein]?.amount ?? 0)),
      carbs: round4(total.carbs + (snapshot[MACRO_CODES.carbs]?.amount ?? 0)),
      fat: round4(total.fat + (snapshot[MACRO_CODES.fat]?.amount ?? 0)),
    };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  if (total === null) return null;
  // Round the meal once, as the saved snapshots' total is displayed, not once per ingredient.
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return { kcal: Math.round(total.kcal), protein: round1(total.protein),
    carbs: round1(total.carbs), fat: round1(total.fat) };
}
