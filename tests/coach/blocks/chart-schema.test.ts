import { describe, expect, it } from "vitest";
import { chartBlockV1Schema, uiBlockSchema } from "@/lib/coach/ui-blocks";
import { INVALID_CHART_BLOCKS, VALID_TREND } from "@/tests/fixtures/coach-chart-blocks";

describe("chart block schema on replay", () => {
  it("accepts a valid nutrition trend block, nulls and floors included", () => {
    expect(chartBlockV1Schema.safeParse(VALID_TREND).success).toBe(true);
    expect(uiBlockSchema.safeParse(VALID_TREND).success).toBe(true);
  });

  it("still accepts an older kcal_week block: a logged-day count, no range", () => {
    expect(chartBlockV1Schema.safeParse({
      kind: "chart", v: 1, id: "old", chart: "kcal_week", days: 3, unit: "kcal",
      caption: "Calories over 3 logged days",
      series: [{ label: "Consumed", points: [{ x: "2026-09-17", y: 1500 }] },
        { label: "Target", points: [{ x: "2026-09-17", y: 2000 }] }],
    }).success).toBe(true);
  });

  it("accepts a range of exactly 90 days with points on both ends", () => {
    expect(chartBlockV1Schema.safeParse({ ...VALID_TREND, days: 90, start: "2026-06-22",
      series: [{ label: "Protein", points: [{ x: "2026-06-22", y: 1 }, { x: "2026-09-19", y: 2 }] }],
    }).success).toBe(true);
  });

  it.each(INVALID_CHART_BLOCKS)("refuses %s", (_, block) => {
    expect(uiBlockSchema.safeParse(block).success).toBe(false);
  });
});
