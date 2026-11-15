import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = "scripts/eval/public-capture/";
const labels = JSON.parse(readFileSync(`${root}label-gold.json`, "utf8")) as {
  id: string; name: string; servingGrams: number;
  printed: Record<string, string | number>; per100g: Record<string, number>;
}[];
const cases = readFileSync(`${root}cases.jsonl`, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("authored public gold integrity", () => {
  it.each([
    ["label-40g", "Synthetic Oat Squares"],
    ["label-50g", "Synthetic Rice Apple Mix"],
  ])("keeps %s's printed product identity distinct from its nutrient names", (id, name) => {
    // Product names independently adjudicated from the printed PNGs; TEST is a fixture marker.
    const label = labels.find((row) => row.id === id)!;
    expect(label.name).toBe(name);
    const capture = cases.find((row) => row.media === `${root}${id}.png`)!;
    expect(capture.expect[0].label).toBe(name);
    expect(capture.expectedLabel.name).toBe(name);
  });

  it("derives per-100-g gold from each printed serving without filling absent nutrients", () => {
    const fields = { Calories: "energy_kcal", "Total Fat": "fat_total",
      "Total Carbohydrate": "carbohydrate", Protein: "protein" };
    for (const label of labels) {
      expect(label.servingGrams).toBeGreaterThan(0);
      for (const [printed, code] of Object.entries(fields)) {
        expect(label.per100g[code]).toBeCloseTo(Number.parseFloat(String(label.printed[printed])) * 100 / label.servingGrams);
      }
      expect(Object.keys(label.per100g).sort()).toEqual(Object.values(fields).sort());
    }
  });

  it("binds the corpus and committed images to the manifest hashes", () => {
    const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8"));
    expect(hash(`${root}cases.jsonl`)).toBe(manifest.corpusSha256);
    expect(hash(`${root}label-gold.json`)).toBe(manifest.labelGoldSha256);
    for (const image of manifest.cases) expect(hash(`${root}${image.id}.png`)).toBe(image.sha256);
    for (const image of manifest.authoredAssets) expect(hash(image.path)).toBe(image.sha256);
  });
});
