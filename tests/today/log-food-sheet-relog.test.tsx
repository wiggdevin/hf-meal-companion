// @vitest-environment jsdom
/**
 * Fast logging (2026-11-21): the log sheet's one-tap re-log. A recent meal, "Same as yesterday" and
 * a star logged before each log at their last foods and grams with no portion step, then hand the
 * result to Today (which closes the sheet and offers Undo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FavoriteRow } from "@/lib/favorites";
import type { LoggedFood, LoggedItem, StoredDay } from "@/lib/types";

const EGG = "aaaaaaaa-0000-4000-8000-000000000001";
const relogOnce = vi.hoisted(() => vi.fn());
const days = vi.hoisted(() => ({ current: {} as Record<string, StoredDay> }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/components/Sheet", () => ({
  default: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) =>
    <div>{children}{footer}</div>,
  Pill: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock("@/components/CatalogSearch", () => ({ default: () => null }));
vi.mock("@/components/FavoritesStrip", () => ({
  default: ({ onPick }: { onPick: (row: FavoriteRow) => void }) => (
    <button type="button" onClick={() => onPick({ kind: "food", id: "f1", name: "Egg", sort: 0,
      foodRefId: EGG, catalogFoodId: 7 })}>Star egg</button>
  ),
}));
vi.mock("@/lib/store", async (original) => ({
  ...(await original<typeof import("@/lib/store")>()),
  loadStore: () => ({ days: days.current }),
}));
vi.mock("@/lib/log/quick-relog", async (original) => ({
  ...(await original<typeof import("@/lib/log/quick-relog")>()),
  relogOnce: (...args: unknown[]) => relogOnce(...args),
}));

import LogFoodSheet from "@/components/LogFoodSheet";

function item(ref: string, grams: number): LoggedItem {
  return { id: crypto.randomUUID(), seq: 1, food_ref_id: ref, grams, qty: grams, unit: "g", snapshot: {},
    foodId: ref, name: "Egg", portionLabel: "g", macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
}
const eggs: LoggedFood = { id: "e1", foodId: "x", name: "Two eggs", slot: "meal-1", portionLabel: "1", qty: 1,
  grams: 100, macros: { kcal: 140, protein: 12, carbs: 0, fat: 10 }, items: [item(EGG, 100)], rev: 1,
  at: "2026-11-20T08:00:00.000Z" };

const AT = new Date(2026, 10, 21, 8, 30);
let savedFlag: string | undefined;

beforeEach(() => {
  savedFlag = process.env.NEXT_PUBLIC_CATALOG_SEARCH;
  process.env.NEXT_PUBLIC_CATALOG_SEARCH = "1";
  days.current = { "2026-11-20": { extras: [eggs] } as StoredDay };
  relogOnce.mockReset();
  relogOnce.mockResolvedValue({ ok: true, date: "2026-11-21", ids: ["new-1"], message: null });
});

afterEach(() => {
  cleanup();
  if (savedFlag === undefined) delete process.env.NEXT_PUBLIC_CATALOG_SEARCH;
  else process.env.NEXT_PUBLIC_CATALOG_SEARCH = savedFlag;
});

function sheet(onRelogged?: (done: unknown) => void) {
  return render(<LogFoodSheet mode="food" mine={{}} slot="meal-1" at={AT} onAdd={() => {}}
    onSomethingElse={() => {}} onClose={() => {}} onCapture={() => {}} onRelogged={onRelogged} />);
}

describe("LogFoodSheet's one-tap re-log", () => {
  it("logs a recent meal in one tap, in this slot, and hands the result to Today", async () => {
    const onRelogged = vi.fn();
    sheet(onRelogged);
    fireEvent.click(screen.getByRole("button", { name: "Log Two eggs again" }));
    await waitFor(() => expect(onRelogged).toHaveBeenCalledWith({ ok: true, date: "2026-11-21", ids: ["new-1"], message: null }));
    expect(relogOnce).toHaveBeenCalledWith([eggs], { at: AT, slot: "meal-1" });
  });

  it("offers Same as yesterday when this slot held entries yesterday", async () => {
    const onRelogged = vi.fn();
    sheet(onRelogged);
    fireEvent.click(screen.getByRole("button", { name: "Same as yesterday" }));
    await waitFor(() => expect(relogOnce).toHaveBeenCalledWith([eggs], { at: AT, slot: "meal-1" }));
  });

  it("logs a star logged before at its last portion, with no portion step", async () => {
    const onRelogged = vi.fn();
    sheet(onRelogged);
    fireEvent.click(screen.getByRole("button", { name: "Star egg" }));
    await waitFor(() => expect(onRelogged).toHaveBeenCalled());
    expect(relogOnce).toHaveBeenCalledWith([eggs], { at: AT, slot: "meal-1" });
  });

  it("keeps the sheet open and says so when nothing logged", async () => {
    relogOnce.mockResolvedValue({ ok: false, date: null, ids: [], message: "The server would not take that one. Try again." });
    const onRelogged = vi.fn();
    sheet(onRelogged);
    fireEvent.click(screen.getByRole("button", { name: "Log Two eggs again" }));
    await waitFor(() => expect(screen.getByText("The server would not take that one. Try again.")).toBeTruthy());
    expect(onRelogged).not.toHaveBeenCalled();
  });

  it("shows no recents row where Today did not ask for one", () => {
    sheet(undefined);
    expect(screen.queryByRole("button", { name: "Same as yesterday" })).toBeNull();
  });
});
