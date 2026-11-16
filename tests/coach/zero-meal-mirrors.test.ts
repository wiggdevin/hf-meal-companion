import { describe, expect, it } from "vitest";
import { EMPTY_WIRE_STEP, turnStepWireSchemaFor } from "@/lib/coach/wire";
const TODAY = "2026-11-15";
const action = { kind: "set_slot_meal", from: TODAY, through: "2026-11-28", slot: "meal-1",
  weekdays: [1, 2, 3, 4, 5], title: "Oatmeal with blueberries",
  items: [{ name: "Oatmeal" }, { name: "Blueberries" }] };
const zero = (name = "Oatmeal", foodRefId: string | null = null) => ({ name, foodRefId, grams: 0 });
const parse = (over: Record<string, unknown>) => turnStepWireSchemaFor(TODAY).safeParse({
  ...EMPTY_WIRE_STEP, kind: "final", text: "The weekday meal is ready.", ...over,
});

describe("zero-gram UI mirrors never become food quantities", () => {
  it("discards only redundant zero mirrors of a structurally valid slot-meal action", () => {
    const result = parse({ actions: [action], suggestions: [zero(), zero("Blueberries")] });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "final") {
      expect(result.data.actions).toMatchObject([action]);
      expect(result.data.suggestions ?? []).toEqual([]);
    }
  });
  it("accepts the exact flat provider zero placeholders as missing action amounts, not quantities", () => {
    const result = parse({ actions: [{ ...action, items: [{ name: "Oatmeal", grams: 0 }],
      item: { name: "Oatmeal", grams: 0 }, name: "Oatmeal", grams: 0, entryId: "",
      numericArgs: [], stringArgs: [] }], suggestions: [{ name: "OATMEAL ", grams: 0 }] });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "final") {
      expect(result.data.actions).toMatchObject([{ items: [{ name: "Oatmeal" }] }]);
      expect((result.data.actions?.[0] as { items?: { grams?: number }[] }).items?.[0]).not.toHaveProperty("grams");
      expect(result.data.suggestions).toBeUndefined();
    }
  });
  it("preserves real positive food suggestions", () => {
    const result = parse({ actions: [action], suggestions: [{ name: "Oatmeal", grams: 175 }] });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "final") expect(result.data.suggestions?.[0].grams).toBe(175);
  });
  it.each([
    { suggestions: [zero()] },
    { actions: [action], suggestions: [zero("Rice")] },
    { actions: [action], suggestions: [zero("Oatmeal", "")] },
    { actions: [action], suggestions: [zero("Oatmeal, cooked")] },
    { actions: [{ kind: "log_meal", date: TODAY, at: "08:00", slot: "meal-1", items: [{ name: "Oatmeal", grams: 100 }] }], suggestions: [zero()] },
    { actions: [action], suggestions: [zero("Oatmeal", "3f1b1a2c-0000-4000-8000-000000000001")] },
    { actions: [{ ...action, items: [{ name: "Rice milk" }] }], suggestions: [zero("Rice")] },
    { actions: [{ ...action, slot: "invalid" }], suggestions: [zero()] },
    { actions: [{ ...action, items: [] }], suggestions: [zero()] },
    { actions: [{ kind: "add_to_eats", name: "Oatmeal" }], suggestions: [zero()] },
    { actions: [action], suggestions: [zero(), zero("Rice")] },
    { actions: [action], suggestions: [{ name: "Oatmeal", grams: -1 }] },
    { actions: [action], suggestions: [{ name: "Oatmeal", grams: 2001 }] },
  ])("keeps the strict invalid-quantity/identity boundary: %j", (input) => {
    const result = parse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as { code: string; params?: { reason?: string } };
      const supplied = input as { actions?: { slot?: string; items?: unknown[] }[]; suggestions: { grams: number }[] };
      if (supplied.suggestions[0].grams === -1) expect(issue.code).toBe("too_small");
      else if (supplied.suggestions[0].grams === 2001) expect(issue.code).toBe("too_big");
      else if (supplied.actions?.[0].slot === "invalid")
        expect(issue.code).toBe("invalid_value");
      else if (supplied.actions?.[0].items?.length === 0)
        expect(issue.params?.reason).toBe("action_0_set_slot_meal_unsupported");
      else expect(issue.params?.reason).toBe("final_suggestions_invalid");
    }
  });
});
