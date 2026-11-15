import { describe, expect, it } from "vitest";
import { gramsFor, matchPortion, parseAmount, portionAmount } from "@/lib/capture/quantity";

const PORTIONS = [
  { id: 5, description: "1 cup, cooked", gramWeight: 158 },
  { id: 6, description: "1 slice", gramWeight: 28 },
  { id: 7, description: "1 whole", gramWeight: 50 },
];

describe("parseAmount", () => {
  it.each([
    ["two eggs", 2, "whole"],
    ["half an avocado", 0.5, "whole"],
    ["1/2 cup of rice", 0.5, "cup"],
    ["a rice cake", 1, "whole"],
    ["150 g chicken", 150, "g"],
    ["3 oz salmon", 3, "oz"],
    ["1 tbsp olive oil", 1, "tbsp"],
    ["2 slices of bacon", 2, "slice"],
    ["quarter of a melon", 0.25, "whole"],
    ["1 1/2 cups of cooked rice", 1.5, "cup"],
    ["2 3/4 oz cheese", 2.75, "oz"],
    ["1½ cups rice", 1.5, "cup"],
    ["½ cup oats", 0.5, "cup"],
    ["1 kg potatoes", 1, "kg"],
    ["half a pound of salmon", 0.5, "lb"],
  ])("reads %s as %s %s", (text, qty, unit) => {
    expect(parseAmount(text)).toEqual({ qty, unit });
  });

  it.each([["a handful of olives"], ["some rice"], ["a scoop of protein"], ["chicken"],
    ["0/2 cups rice"], ["1/0 cup rice"], ["-2 kg potatoes"], ["-0.5 cup rice"],
    ["1-2 cups rice"], ["1–2 cups rice"], ["1 to 2 cups rice"], ["(−2 kg) potatoes"],
    ["(-2 kg) potatoes"], ["-½ cup oats"], ["−¼ cup rice"], ["½–¾ cup oats"]])(
    "refuses the vague amount in %s", (text) => expect(parseAmount(text)).toBeNull()
  );
});

describe("matchPortion", () => {
  it("finds the portion row whose description names the unit", () => {
    expect(matchPortion("cup", PORTIONS)?.id).toBe(5);
    expect(matchPortion("slice", PORTIONS)?.id).toBe(6);
  });
  it("returns null when no portion names it", () => {
    expect(matchPortion("tbsp", PORTIONS)).toBeNull();
  });
});

describe("portionAmount", () => {
  it.each([
    ["1 cup, cooked", 1], ["0.5 cup", 0.5], ["1/2 cup", 0.5], ["1 1/2 cups", 1.5], ["2 tbsp", 2],
    [".25 cup", 0.25], ["3 oz", 3], ["NLEA serving", 1], ["slice", 1], ["0 cup", 1], ["1/0 cup", 1],
  ])("reads %s as %s", (label, amount) => expect(portionAmount(label)).toBe(amount));
});

describe("matchPortion", () => {
  it("prefers a one-unit row over another amount of the same unit", () => {
    const rows = [{ id: 1, description: "0.5 cup", gramWeight: 120 },
      { id: 2, description: "1 cup", gramWeight: 240 }];
    expect(matchPortion("cup", rows)?.id).toBe(2);
  });
  it("skips a row with no usable gram weight", () => {
    expect(matchPortion("cup", [{ id: 1, description: "1 cup", gramWeight: 0 }])).toBeNull();
  });
});

describe("gramsFor", () => {
  it("passes grams through and converts ounces", () => {
    expect(gramsFor(150, "g", [])).toBe(150);
    expect(gramsFor(3, "oz", [])).toBeCloseTo(85.05, 2);
  });
  it("converts explicit metric and imperial mass without inventing a food density", () => {
    expect(gramsFor(0.5, "kg", [])).toBe(500);
    expect(gramsFor(250, "mg", [])).toBe(0.25);
    expect(gramsFor(1, "lb", [])).toBeCloseTo(453.59237, 5);
    expect(gramsFor(2, "pounds", [])).toBeCloseTo(907.18474, 5);
    expect(gramsFor(16, "oz", [])).toBe(gramsFor(1, "lb", []));
    expect(gramsFor(1, "ml", [])).toBeNull();
  });
  it("multiplies the matching portion's gram weight", () => {
    expect(gramsFor(2, "slice", PORTIONS)).toBe(56);
    expect(gramsFor(0.5, "cup", PORTIONS)).toBe(79);
  });
  it("divides by the amount the matched portion label names (A006)", () => {
    expect(gramsFor(1, "cup", [{ id: 1, description: "0.5 cup", gramWeight: 120 }])).toBe(240);
    expect(gramsFor(1, "cup", [{ id: 1, description: "1/2 cup", gramWeight: 120 }])).toBe(240);
    expect(gramsFor(1, "tbsp", [{ id: 1, description: "2 tbsp", gramWeight: 30 }])).toBe(15);
    expect(gramsFor(1, "cup", [{ id: 1, description: "2 cups", gramWeight: 480 }])).toBe(240);
    expect(gramsFor(2, "cup", [{ id: 1, description: "2 cups, chopped", gramWeight: 300 }])).toBe(300);
    expect(gramsFor(3, "slice", [{ id: 1, description: "1 1/2 slices", gramWeight: 45 }])).toBe(90);
  });
  it("returns null for a volume unit with no portion row, rather than guessing a density", () => {
    expect(gramsFor(1, "tbsp", PORTIONS)).toBeNull();
  });
  it("never invents 100 g for a whole or a piece with no portion row (A007, A044)", () => {
    expect(gramsFor(2, "whole", [])).toBeNull();
    expect(gramsFor(8, "piece", [{ id: 1, description: "1 large", gramWeight: 6 }])).toBeNull();
    expect(gramsFor(1, "whole", PORTIONS)).toBe(50);
  });
});
