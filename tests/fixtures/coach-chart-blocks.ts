/**
 * Stored `chart` blocks a replay must refuse (lib/coach/ui-blocks.ts `chartBlockV1Schema`): each
 * one is a valid block with one field broken. `VALID_TREND` is the base they are built from.
 */
export const VALID_TREND = {
  kind: "chart", v: 1, id: "chart-valid", chart: "macros_trend", days: 14,
  start: "2026-09-06", end: "2026-09-19", focus: "protein",
  series: [
    { label: "Protein", points: [{ x: "2026-09-18", y: null, partial: true }, { x: "2026-09-19", y: 90.5 }] },
    { label: "Protein target", points: [{ x: "2026-09-19", y: 135 }] },
  ],
  unit: "g", caption: "Protein, carbs and fat, Sep 6 – Sep 19, 2026 (2 logged days)", partial: true,
} as const;

const many = (n: number) => Array.from({ length: n }, (_, i) =>
  ({ x: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), y: 1 }));

export const INVALID_CHART_BLOCKS: readonly [string, unknown][] = [
  ["a fractional days", { ...VALID_TREND, days: 14.5 }],
  ["days over 90", { ...VALID_TREND, days: 91 }],
  ["a macros_trend window under 7 days", { ...VALID_TREND, days: 3 }],
  ["days of 0", { ...VALID_TREND, chart: "kcal_week", days: 0 }],
  ["an x that is not a date", { ...VALID_TREND, series: [{ label: "Protein", points: [{ x: "protein", y: 1 }] }] }],
  ["an impossible date", { ...VALID_TREND, series: [{ label: "Protein", points: [{ x: "2026-02-30", y: 1 }] }] }],
  ["a weight point that is not a date", { ...VALID_TREND, chart: "weight_trend", days: 30,
    series: [{ label: "Weight", points: [{ x: "yesterday", y: 60 }] }] }],
  ["a null weight point", { ...VALID_TREND, chart: "weight_trend", days: 30,
    series: [{ label: "Weight", points: [{ x: "2026-09-19", y: null }] }] }],
  ["more than 120 points", { ...VALID_TREND, start: undefined, end: undefined,
    series: [{ label: "Protein", points: many(121) }] }],
  ["more than 8 series", { ...VALID_TREND, series: Array.from({ length: 9 }, () => ({ label: "Protein", points: [] })) }],
  ["a start after its end", { ...VALID_TREND, start: "2026-09-20" }],
  ["a start that is not a date", { ...VALID_TREND, start: "Sep 6" }],
  ["a start with no end", { ...VALID_TREND, end: undefined }],
  ["an end with no start", { ...VALID_TREND, start: undefined }],
  ["a range over 90 days", { ...VALID_TREND, start: "2026-06-20" }],
  ["a point before the range", { ...VALID_TREND, series: [{ label: "Protein", points: [{ x: "2026-09-05", y: 1 }] }] }],
  ["a point after the range", { ...VALID_TREND, series: [{ label: "Protein", points: [{ x: "2026-09-20", y: 1 }] }] }],
  ["an unknown focus", { ...VALID_TREND, focus: "fibre" }],
  ["a partial flag that is not true", { ...VALID_TREND, series: [{ label: "Protein",
    points: [{ x: "2026-09-19", y: 1, partial: false }] }] }],
];
