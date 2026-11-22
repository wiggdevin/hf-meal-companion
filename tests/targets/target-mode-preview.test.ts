// tests/targets/target-mode-preview.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gramsModeKcal, previewGrams, targetModeRequest } from "@/components/TargetModeSheet";
import { toPounds, WEIGHT_LB_PER_KG } from "@/components/WeightTrend";
import { CARB_G_MIN, FAT_G_MIN, type MacroFloors } from "@/lib/targets/percent";

const KCAL_MIN = 1650; // a fixture account's own minimum
const FLOORS: MacroFloors = { kcalMin: KCAL_MIN, proteinGMin: 135, fatGMin: FAT_G_MIN, carbGMin: CARB_G_MIN };

describe("previewGrams", () => {
  it("shows the grams each day type produces, from the same function the server uses", () => {
    const out = previewGrams(2200, 1750, { proteinPct: 31, fatPct: 30, carbPct: 39 }, FLOORS);
    expect(out.ok).toBe(true);
    expect(out.training.proteinG).toBeGreaterThanOrEqual(135);
    expect(out.rest.proteinG).toBeGreaterThanOrEqual(135);
    expect(Math.abs(4 * out.training.proteinG + 9 * out.training.fatG + 4 * out.training.carbG - 2200))
      .toBeLessThanOrEqual(10);
  });

  it("reports the floor failure and the minimum percent instead of silently fixing it", () => {
    const out = previewGrams(2200, 1750, { proteinPct: 20, fatPct: 30, carbPct: 50 }, FLOORS);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("protein_below_floor");
    expect(out.minProteinPct).toBeCloseTo(30.86, 2);
  });

  it("reports a split that does not sum to 100", () => {
    expect(previewGrams(2200, 1750, { proteinPct: 30, fatPct: 30, carbPct: 39 }, FLOORS).error)
      .toBe("percent_sum");
  });
});

describe("toPounds", () => {
  it("converts kilograms for display and keeps nulls as gaps", () => {
    expect(WEIGHT_LB_PER_KG).toBeCloseTo(2.2046226218, 10);
    expect(toPounds([57.6, null, 57.4])).toEqual([127, null, 126.5]);
  });
});

// Audit A054: a manual revision is dated by the phone's day, not the UTC date.
describe("targetModeRequest", () => {
  let savedTz: string | undefined;
  beforeEach(() => { savedTz = process.env.TZ; process.env.TZ = "America/Los_Angeles"; });
  afterEach(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("dates a save at 6 pm Pacific by that evening's date, not the next UTC day", () => {
    const evening = new Date("2026-10-11T01:00:00.000Z"); // 18:00 Oct 10 in Los Angeles
    const grams = { proteinG: 140, fatG: 70, carbG: 252 };
    expect(targetModeRequest("grams", { kcalTrain: 2198, kcalRest: 1802, grams },
      { proteinPct: 30, fatPct: 30, carbPct: 40 }, grams, evening))
      .toEqual({ mode: "grams", effectiveFrom: "2026-10-10", kcalTrain: 2198, kcalRest: 1802, grams });
  });
});

describe("grams mode calories follow the grams (spec 1.5, Grams editor)", () => {
  const grams = { proteinG: 140, fatG: 70, carbG: 252 };
  const initial = { kcalTrain: 2198, kcalRest: 1802, grams };

  it("keeps the opening calories when nothing changed", () => {
    expect(gramsModeKcal(initial, grams)).toEqual({ kcalTrain: 2198, kcalRest: 1802 });
  });

  it("moves both days by 20 kcal for +5 g protein, and the save carries them", () => {
    const stepped = { ...grams, proteinG: 145 };
    expect(gramsModeKcal(initial, stepped)).toEqual({ kcalTrain: 2218, kcalRest: 1822 });
    const req = targetModeRequest("grams", initial, { proteinPct: 30, fatPct: 30, carbPct: 40 },
      stepped, new Date("2026-10-10T20:00:00.000Z"));
    expect(req).toMatchObject({ mode: "grams", kcalTrain: 2218, kcalRest: 1822, grams: stepped });
  });

  it("moves only the training day for a carb step: the rest day keeps its own carbs", () => {
    expect(gramsModeKcal(initial, { ...grams, carbG: 257 })).toEqual({ kcalTrain: 2218, kcalRest: 1802 });
  });

  it("never gives the rest day negative carbs", () => {
    const low = { kcalTrain: 2198, kcalRest: 900, grams };
    expect(gramsModeKcal(low, grams).kcalRest).toBe(4 * 140 + 9 * 70);
  });

  it("leaves a percent save's calories as the user's", () => {
    const req = targetModeRequest("percent", initial, { proteinPct: 30, fatPct: 30, carbPct: 40 },
      grams, new Date("2026-10-10T20:00:00.000Z"));
    expect(req).toMatchObject({ mode: "percent", kcalTrain: 2198, kcalRest: 1802 });
  });
});
