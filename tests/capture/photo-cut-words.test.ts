/**
 * Weak-spot audit 2026-11-17 item 7: photo item names carried cut and shape words ("pineapple
 * chunks", "broccoli florets") the prompt already sends to notes, and matched the catalog worse.
 * A closed list of cut and shape words moves from the label to the draft's notes; cooking method,
 * variety and colour stay, since they change nutrition or identity.
 */
import { describe, expect, it } from "vitest";
import { withoutCutWords } from "@/lib/capture/photo-names";

const item = (label: string) => ({ label, grams: 100, qty: 1, unit: "whole", confidence: 0.8 });
const run = (...labels: string[]) => withoutCutWords({ items: labels.map(item), notes: ["kept"] });

describe("photo item names keep the food, not its cut", () => {
  it.each([
    ["pineapple chunks", "pineapple"],
    ["broccoli florets", "broccoli"],
    ["roasted potato chunks", "roasted potato"],
    ["sliced banana", "banana"],
    ["apple slices", "apple"],
    ["orange wedges", "orange"],
    ["cubed cantaloupe", "cantaloupe"],
    ["chunks of pineapple", "pineapple"],
    ["strawberry halves", "strawberry"],
    ["whole banana", "banana"],
  ])("%s → %s, with the cut in notes", (label, expected) => {
    const out = run(label);
    expect(out.items[0].label).toBe(expected);
    expect(out.notes[0]).toBe("kept");
    expect(out.notes.slice(1).join(" ")).toContain(label);
  });

  it.each(["steamed broccoli", "scrambled eggs", "whole milk", "whole wheat bread",
    "red bell pepper", "grilled chicken breast", "half and half"])(
    "leaves %s unchanged", (label) => {
      const out = run(label);
      expect(out.items[0].label).toBe(label);
      expect(out.notes).toEqual(["kept"]);
    });

  it("never empties a label that is only a cut word", () => {
    expect(run("slices").items[0].label).toBe("slices");
  });

  it("keeps every other field and the item order", () => {
    const out = withoutCutWords({ items: [
      { ...item("pineapple chunks"), grams: 120, qty: 6, unit: "piece", brand: "X" },
      item("rice"),
    ], notes: [] });
    expect(out.items).toEqual([
      { label: "pineapple", grams: 120, qty: 6, unit: "piece", confidence: 0.8, brand: "X" },
      item("rice"),
    ]);
  });
});
