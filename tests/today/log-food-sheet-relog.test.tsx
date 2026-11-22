// @vitest-environment jsdom
/**
 * Fast logging (2026-11-21): the log sheet's one-tap re-log. A recent meal, "Same as yesterday" and
 * a star logged before each log at their last foods and grams with no portion step, through
 * Today's batches (`onRelog`). The sheet shares logPicks' in-flight guard, disables every re-log
 * control while one runs, and closes only itself, only while it is still open.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FavoriteRow } from "@/lib/favorites";
import type { RelogBatch } from "@/lib/log/relog-batch";
import type { RelogStart } from "@/components/today/useRelogBatches";
import type { StoredDay } from "@/lib/types";
import { EGG, RICE, entry, item } from "../log/fast/relog-fixtures";

const savedMealRefs = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/components/Sheet", () => ({
  default: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) =>
    <div>{children}{footer}</div>,
  Pill: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock("@/components/CatalogSearch", () => ({ default: () => null }));
vi.mock("@/components/FavoritesStrip", () => ({
  default: ({ onPick, disabled }: { onPick: (row: FavoriteRow) => void; disabled?: boolean }) => (
    <>
      <button type="button" disabled={disabled} onClick={() => onPick({ kind: "food", id: "f1", name: "Egg", sort: 0,
        foodRefId: EGG, catalogFoodId: 7 })}>Star egg</button>
      <button type="button" disabled={disabled} onClick={() => onPick({ kind: "meal", id: "m1", name: "Two eggs", sort: 1 })}>
        Star meal</button>
    </>
  ),
}));
vi.mock("@/lib/log/quick-relog", async (original) => ({
  ...(await original<typeof import("@/lib/log/quick-relog")>()),
  savedMealRefs: (...args: unknown[]) => savedMealRefs(...args),
}));

import LogFoodSheet from "@/components/LogFoodSheet";

const eggs = entry("e1", "2026-11-20T08:00:00.000Z", [item(EGG, 100)], { name: "Two eggs" });
const bowl = entry("b1", "2026-11-19T13:00:00.000Z", [item(EGG, 50), item(RICE, 200, 2)],
  { name: "Rice bowl", slot: "meal-2", grams: 250 });
const DAYS: Record<string, StoredDay> = {
  "2026-11-19": { extras: [bowl] } as StoredDay,
  "2026-11-20": { extras: [eggs] } as StoredDay,
};
const AT = new Date(2026, 10, 21, 8, 30);

const batch = (state: "done" | "failed", message?: string) => ({
  opId: "op", at: AT.toISOString(), tz: "UTC", account: { userId: "u", epoch: 1 }, sources: [],
  receipts: [{ sourceId: "e1", entryId: "n1", itemIds: [], name: "Two eggs", date: "2026-11-21", state, message }],
  warnings: [], nutritionUnchecked: false,
}) as RelogBatch;

let savedFlag: string | undefined;
let onRelog: Mock<RelogStart>;
let onClose: Mock<() => void>;

beforeEach(() => {
  savedFlag = process.env.NEXT_PUBLIC_CATALOG_SEARCH;
  process.env.NEXT_PUBLIC_CATALOG_SEARCH = "1";
  onRelog = vi.fn<RelogStart>(async () => batch("done"));
  onClose = vi.fn<() => void>();
  savedMealRefs.mockReset();
});

afterEach(() => {
  cleanup();
  if (savedFlag === undefined) delete process.env.NEXT_PUBLIC_CATALOG_SEARCH;
  else process.env.NEXT_PUBLIC_CATALOG_SEARCH = savedFlag;
});

function sheet(withRelog = true) {
  return render(<LogFoodSheet mode="food" mine={{}} slot="meal-1" at={AT} onAdd={() => {}}
    onSomethingElse={() => {}} onClose={onClose} onCapture={() => {}} days={DAYS}
    onRelog={withRelog ? onRelog : undefined} />);
}

describe("LogFoodSheet's one-tap re-log", () => {
  it("names each recent chip's portion and day, logs it in this slot, and closes this sheet", async () => {
    sheet();
    expect(screen.getByRole("group", { name: "Log again" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log Two eggs again, 2 eggs · yesterday" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onRelog).toHaveBeenCalledWith([eggs], { at: AT, slot: "meal-1", durableKey: undefined });
    expect(screen.getByRole("button", { name: /Log Rice bowl again, 2 foods, 250 g · Thu, Nov 19/ })).toBeTruthy();
  });

  it("offers Same as yesterday with a durable key and says what it copies", async () => {
    sheet();
    expect(screen.getByText("Same as yesterday: Copies Two eggs.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Same as yesterday" }));
    await waitFor(() => expect(onRelog).toHaveBeenCalledWith([eggs],
      { at: AT, slot: "meal-1", durableKey: "same-as-yesterday:2026-11-21:meal-1" }));
  });

  it("logs a star logged before at its last portion, with no portion step", async () => {
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Star egg" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRelog).toHaveBeenCalledWith([eggs], expect.objectContaining({ slot: "meal-1" }));
  });

  it("matches a starred meal by its saved foods, not its name", async () => {
    savedMealRefs.mockResolvedValue([RICE, EGG]);
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Star meal" }));
    await waitFor(() => expect(onRelog).toHaveBeenCalledWith([bowl], expect.anything()));
    expect(savedMealRefs).toHaveBeenCalledWith("m1");
  });

  it("does not re-log a starred meal whose foods were never logged, even with a matching name", async () => {
    savedMealRefs.mockResolvedValue([RICE]);
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Star meal" }));
    await waitFor(() => expect(screen.getByText(/Saved meals are offered/)).toBeTruthy());
    expect(onRelog).not.toHaveBeenCalled();
  });

  it("disables every re-log control while one is pending, and a second tap sends nothing", async () => {
    let release: (b: RelogBatch | null) => void = () => {};
    onRelog.mockImplementation(() => new Promise((r) => { release = r; }));
    sheet();
    fireEvent.click(screen.getByRole("button", { name: /Log Two eggs again/ }));
    fireEvent.click(screen.getByRole("button", { name: "Same as yesterday" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Star egg" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Same as yesterday" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Log Rice bowl again/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onRelog).toHaveBeenCalledTimes(1);
    await act(async () => { release(batch("done")); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes nothing when the sheet that started it is gone", async () => {
    let release: (b: RelogBatch | null) => void = () => {};
    onRelog.mockImplementation(() => new Promise((r) => { release = r; }));
    const view = sheet();
    fireEvent.click(screen.getByRole("button", { name: /Log Two eggs again/ }));
    view.unmount();
    await act(async () => { release(batch("done")); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the sheet open and says so when nothing logged", async () => {
    onRelog.mockResolvedValue(batch("failed", "The server would not take that one. Try again."));
    sheet();
    fireEvent.click(screen.getByRole("button", { name: /Log Two eggs again/ }));
    await waitFor(() => expect(screen.getByText("The server would not take that one. Try again.")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows no recents row where Today did not ask for one", () => {
    sheet(false);
    expect(screen.queryByRole("button", { name: "Same as yesterday" })).toBeNull();
  });
});
