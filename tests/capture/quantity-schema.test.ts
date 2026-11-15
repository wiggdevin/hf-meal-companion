import { describe, expect, it } from "vitest";
import { captureItemSchema } from "@/lib/ai/schemas";
import { gramsFor, parseAmount } from "@/lib/capture/quantity";

const item = (qty: number, unit: string, grams: number) => ({
  label: "salt", qty, unit, grams, confidence: 0.9,
});

describe("mass quantity admission through capture", () => {
  it.each([[500, "mg", 0.5], [1, "kg", 1000], [1, "pound", 453.59237]])(
    "admits %s %s before exact deterministic conversion", (qty, unit, grams) => {
      const parsed = captureItemSchema.parse(item(qty, unit, grams));
      const amount = parseAmount(`${parsed.qty} ${parsed.unit} ${parsed.label}`)!;
      expect(gramsFor(amount.qty, amount.unit, [])).toBeCloseTo(grams, 8);
    },
  );
  it.each([[5_000_001, "mg"], [5.001, "kg"], [12, "lb"], [101, "whole"], [101, "cup"],
    [101, "constructor"], [101, "__proto__"], [101, "toString"]])(
    "retains the physical 5000-g and count/volume caps for %s %s", (qty, unit) => {
      expect(captureItemSchema.safeParse(item(qty, unit, 1)).success).toBe(false);
    },
  );
});
